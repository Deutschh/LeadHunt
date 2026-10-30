const {Server}=require('socket.io');
const P=require('../services/jobPolicy');
function operational(context) {
  if (!context?.workspace?.isActive || context.workspace.accountStatus!=='active' || context.workspace.id!==context.membership?.workspaceId) P.reject('WORKSPACE_NOT_OPERATIONAL',403);
}
function attachRuntimeSocketServer({httpServer,runtime,accessTokenService,identityService,corsOrigins=[],logger=console}) {
  const io=new Server(httpServer,{cors:{origin:corsOrigins,methods:['GET','POST']},maxHttpBufferSize:16384});
  const agents=io.of('/agent'),web=io.of('/workspace');
  let stopped=false,ticking=false;
  const pendingDisconnects=new Set();
  const connectionBudget=new Map();
  function admit(socket) {
    const key=socket.handshake.address,now=Date.now(),previous=connectionBudget.get(key);
    if(previous && previous.until>now && previous.count>=60)P.reject('RATE_LIMITED',429);
    connectionBudget.set(key,previous && previous.until>now ? {...previous,count:previous.count+1}:{until:now+60000,count:1});
    if(connectionBudget.size>1000)connectionBudget.delete(connectionBudget.keys().next().value);
  }
  const ready=runtime.initialize().then(()=>true).catch(()=>{P.runtimeLog(logger,'runtime unavailable');return false;});
  const failure=(error)=>new Error(error instanceof P.RuntimeError ? error.code:'RUNTIME_UNAVAILABLE');
  io.use((socket,next)=>{try{admit(socket);}catch{}P.runtimeLog(logger,'socket rejected');next(new Error('UNAUTHORIZED'));});
  async function webIdentity(token) {
    const claims=accessTokenService.verify(token);
    const context=await identityService.resolve({userId:claims.sub,authVersion:claims.ver});operational(context);
    return context;
  }
  agents.use(async(socket,next)=>{
    try {
      admit(socket);
      if (!await ready) P.reject('RUNTIME_UNAVAILABLE',503);
      P.exact(socket.handshake.auth,['deviceToken','agentVersion']);
      const ctx=await runtime.authenticate(socket.handshake.auth.deviceToken);
      socket.data.context=await runtime.connect(ctx,socket.handshake.auth.agentVersion);
      next();
    } catch(error) {P.runtimeLog(logger,'socket rejected');next(failure(error));}
  });
  web.use(async(socket,next)=>{
    try {
      admit(socket);
      if (!await ready) P.reject('RUNTIME_UNAVAILABLE',503);
      P.exact(socket.handshake.auth,['accessToken']);
      socket.data.context=await webIdentity(socket.handshake.auth.accessToken);next();
    } catch(error) {P.runtimeLog(logger,'socket rejected');next(failure(error));}
  });
  async function publishWeb(workspaceId,event,payload) {
    for (const socket of web.sockets.values()) {
      if (socket.data.context.workspace.id!==workspaceId) continue;
      try {
        const context=await webIdentity(socket.handshake.auth.accessToken);
        if (context.workspace.id!==workspaceId) throw new Error('changed workspace');
        socket.emit(event,payload);
      } catch {socket.disconnect(true);}
    }
  }
  async function publishPresence(row) {
    if (!row) return;
    const status=row.connected ? row.reported_status:'offline';
    P.runtimeLog(logger,row.connected ? 'device online':'device offline',{workspaceId:row.workspace_id,deviceId:row.device_id,status});
    await publishWeb(row.workspace_id,'device:status',{deviceId:row.device_id,status,lastSeen:row.last_seen_at,agentVersion:row.agent_version});
  }
  function forbidJoin(socket) {socket.on('join',(_payload,ack)=>{if (typeof ack==='function') ack({ok:false,code:'ROOM_FORBIDDEN'});});}
  agents.on('connection',(socket)=>{
    const ctx=socket.data.context;
    socket.join(`workspace:${ctx.workspaceId}`);socket.join(`device:${ctx.deviceId}`);forbidJoin(socket);
    socket.emit('runtime:ready',{sessionId:ctx.sessionId,releaseChannel:ctx.releaseChannel,heartbeatIntervalMs:15000,leaseDurationMs:90000});
    let lastHeartbeat=0,inFlight=false,lastStatus=null;
    socket.on('runtime:heartbeat',async(input,ack)=>{
      if (inFlight || Date.now()-lastHeartbeat<1000) {if (typeof ack==='function') ack({ok:false,code:'RATE_LIMITED'});return;}
      inFlight=true;lastHeartbeat=Date.now();
      try {
        const row=await runtime.heartbeat(ctx,input);
        if (lastStatus!==row.reported_status) {lastStatus=row.reported_status;await publishPresence(row);}
        if (typeof ack==='function') ack({ok:true});
      } catch(error) {if(typeof ack==='function')ack({ok:false,code:failure(error).message});socket.disconnect(true);}
      finally {inFlight=false;}
    });
    socket.on('disconnect',()=>{
      const pending=runtime.disconnect(ctx).then(publishPresence).catch(()=>P.runtimeLog(logger,'runtime disconnect failed'));
      pendingDisconnects.add(pending);pending.finally(()=>pendingDisconnects.delete(pending));
    });
  });
  web.on('connection',(socket)=>{
    socket.join(`workspace:${socket.data.context.workspace.id}`);forbidJoin(socket);
    runtime.presence(socket.data.context.workspace.id).then(async(rows)=>{
      const context=await webIdentity(socket.handshake.auth.accessToken);
      if(context.workspace.id!==socket.data.context.workspace.id)return socket.disconnect(true);
      for(const row of rows)socket.emit('device:status',{deviceId:row.device_id,status:row.status,lastSeen:row.last_seen_at,agentVersion:row.agent_version});
    }).catch(()=>socket.disconnect(true));
  });
  async function tick() {
    if (stopped || ticking || !await ready) return;
    ticking=true;
    try {
    const offline=await runtime.sweep();
    for(const row of offline) {
      for(const socket of agents.sockets.values()) if(socket.data.context.deviceId===row.device_id && socket.data.context.sessionId===row.session_id) socket.disconnect(true);
      await publishPresence(row);
    }
    for(const socket of web.sockets.values()) {
      try {const context=await webIdentity(socket.handshake.auth.accessToken);if(context.workspace.id!==socket.data.context.workspace.id)socket.disconnect(true);}
      catch {socket.disconnect(true);}
    }
    } finally {ticking=false;}
  }
  const timer=setInterval(()=>{tick().catch(()=>P.runtimeLog(logger,'runtime sweep failed'));},5000);timer.unref();
  async function notify(name,fields) {
    if (name==='job queued' || name==='retry scheduled') {
      // Reauthorize each recipient. A room name alone is never authority.
      for(const socket of agents.sockets.values()) {
        const ctx=socket.data.context;if(ctx.workspaceId!==fields.workspaceId)continue;
        try {
          // Authenticate the stored handshake credential afresh before delivery.
          await runtime.authenticate(socket.handshake.auth.deviceToken);
          socket.emit('jobs:available',{});
        } catch {socket.disconnect(true);}
      }
    }
    if(fields.status && fields.updatedAt)await publishWeb(fields.workspaceId,'job:updated',{jobId:fields.jobId,status:fields.status,updatedAt:fields.updatedAt});
  }
  // No DB handle is ever supplied to a consumer; this server owns its repository.
  return {ready,notify,tick,close:async()=>{stopped=true;clearInterval(timer);await new Promise(resolve=>io.close(resolve));await Promise.allSettled([...pendingDisconnects]);}};
}
module.exports={attachRuntimeSocketServer,operational};
