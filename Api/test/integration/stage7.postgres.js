require('../helpers/safeTestEnvironment');
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {Pool}=require('pg');
const {startLocalPostgres}=require('../helpers/localPostgres');
const {createJobService}=require('../../src/services/jobService');
const P=require('../../src/services/jobPolicy');
const http=require('node:http');
const express=require('express');
const {io:createSocket}=require('socket.io-client');
const {createRuntimeRepository}=require('../../src/repositories/runtimeRepository');
const {attachRuntimeSocketServer}=require('../../src/socket/runtimeSocketServer');
const {createAccessTokenService}=require('../../src/services/accessTokenService');
const {createAuthIdentityService}=require('../../src/services/authIdentityService');
const {createAgentJobRouter}=require('../../src/routes/jobRoutes');
const {createRequireDeviceContext}=require('../../src/middleware/requireDeviceContext');
const payload={niche:'Clinicas',location:'Sorocaba',limit:10,minRating:4,minReviews:0,websiteFilter:'any'};
test('Stage 7 real PostgreSQL migrations, jobs, concurrency and recovery',async(t)=>{
  const local=await startLocalPostgres();
  const db=new Pool({...local.config,max:20});
  t.after(async()=>{await db.end();await local.stop();});
  const ctx={workspaceId:'1',deviceId:randomUUID(),sessionId:randomUUID()};
  const consumer2={...ctx,deviceId:randomUUID(),sessionId:randomUUID()};
  const other={workspaceId:'9001',deviceId:randomUUID(),sessionId:randomUUID()};
  for (const file of ['007_verify.sql','008_verify.sql']) {
    const sql=require('node:fs').readFileSync(path.resolve(__dirname,'../../src/database/migrations',file),'utf8');
    const rows=(await db.query(sql)).rows;
    assert.ok(Object.values(rows[0]).every(v=>v===true));
  }
  // Exercise safe rollback and reapplication before any runtime fixture exists.
  for (const file of ['008_rollback.sql','007_rollback.sql','007_jobs_core_foundation.sql','008_distributed_runtime_foundation.sql']) local.sqlFile(path.resolve(__dirname,'../../src/database/migrations',file));
  await db.query("INSERT INTO workspaces(id,slug,name,account_status) VALUES(9001,'fixture-b','Fixture B','active')");
  for (const c of [ctx,consumer2,other]) await db.query('INSERT INTO devices(id,workspace_id,token_digest,token_expires_at) VALUES($1,$2,$3,clock_timestamp()+interval \'1 day\')',[c.deviceId,c.workspaceId,createHash('sha256').update(randomUUID()).digest()]);
  const authorizeConsumer=async(client,c)=>{
    const r=await client.query('SELECT id FROM devices WHERE workspace_id=$1 AND id=$2 AND revoked_at IS NULL AND token_expires_at>clock_timestamp() FOR SHARE',[c.workspaceId,c.deviceId]);
    if (!r.rowCount) P.reject('INVALID_DEVICE',401);
  };
  const events=[];
  const service=createJobService({db,authorizeConsumer,logger:{info:(...e)=>events.push(e)},random:()=>0});
  const make=(c=ctx,key=randomUUID())=>service.create(c,{type:'search',payload,idempotencyKey:key});
  const ready=async()=>db.query("UPDATE workspace_job_runtime SET next_dispatch_at=clock_timestamp()-interval '1 second',is_paused=false");
  await t.test('concurrent creation, claim winner, atomic attempt and idempotent complete',async()=>{
    const key=randomUUID(), jobs=await Promise.all([make(ctx,key),make(ctx,key)]);
    assert.equal(jobs[0].id,jobs[1].id);
    await assert.rejects(service.create(ctx,{type:'search',payload:{...payload,limit:20},idempotencyKey:key}),{code:'IDEMPOTENCY_CONFLICT'});
    const claims=await Promise.all([service.claim(ctx,{lane:'search'}),service.claim(consumer2,{lane:'search'})]);
    assert.equal(claims.filter(Boolean).length,1);
    const job=claims.find(Boolean), owner=claims[0] ? ctx:consumer2;
    const a={attemptId:job.current_attempt_id};
    assert.equal((await service.read(ctx,job.id,true)).length,1);
    await service.mutate(owner,job.id,'start',a);
    await service.mutate(owner,job.id,'renew',a);
    const done=await service.mutate(owner,job.id,'complete',{...a,result:{savedCount:2}});
    assert.equal(done.status,'completed');
    assert.equal((await service.mutate(owner,job.id,'complete',{...a,result:{savedCount:2}})).id,job.id);
    await assert.rejects(service.mutate(owner,job.id,'renew',a),{code:'STALE_LEASE'});
  });
  await t.test('cross workspace read, attempts, cancel, renew and complete return 404',async()=>{
    const job=await make(other);
    for (const operation of [()=>service.read(ctx,job.id),()=>service.read(ctx,job.id,true),()=>service.cancel(ctx,job.id),()=>service.mutate(ctx,job.id,'renew',{attemptId:randomUUID()}),()=>service.mutate(ctx,job.id,'complete',{attemptId:randomUUID(),result:{}})]) await assert.rejects(operation(),{code:'NOT_FOUND'});
    assert.ok((await service.list(ctx)).every(j=>j.workspace_id==='1'));
    await service.cancel(other,job.id);
  });
  await t.test('expiry, stale renew, reclaim, bounded retry and definitive failure',async()=>{
    await ready();const created=await make();let job=await service.claim(ctx,{lane:'search'});
    assert.equal(job.id,created.id);
    const old=job.current_attempt_id;
    await db.query("UPDATE jobs SET leased_until=clock_timestamp()-interval '1 second' WHERE id=$1",[job.id]);
    await assert.rejects(service.mutate(ctx,job.id,'start',{attemptId:old}),{code:'STALE_LEASE'});
    await service.recover();
    let state=await service.read(ctx,job.id);assert.equal(state.status,'queued');assert.ok(new Date(state.available_at)>new Date());
    for (let n=2;n<=3;n++) {
      await db.query("UPDATE jobs SET available_at=clock_timestamp()-interval '1 second' WHERE id=$1",[job.id]);await ready();
      job=await service.claim(consumer2,{lane:'search'});assert.equal(job.attempt_count,n);
      await assert.rejects(service.mutate(ctx,job.id,'start',{attemptId:old}),{code:'STALE_LEASE'});
      state=await service.mutate(consumer2,job.id,'fail',{attemptId:job.current_attempt_id,code:'TRANSIENT'});
    }
    assert.equal(state.status,'failed');assert.equal((await service.read(ctx,job.id,true)).length,3);
    await ready();const second=await make();job=await service.claim(ctx,{lane:'search'});
    assert.equal(job.id,second.id);
    assert.equal((await service.mutate(ctx,job.id,'fail',{attemptId:job.current_attempt_id,code:'DEFINITIVE'})).status,'failed');
  });
  await t.test('pause, cancel and database constraints protect tenant and V1 lane',async()=>{
    await ready();const j=await make();await service.setPaused(ctx,'search',true);
    assert.equal(await service.claim(ctx,{lane:'search'}),null);await service.setPaused(ctx,'search',false);
    const c=await service.claim(ctx,{lane:'search'});assert.equal(c.id,j.id);
    assert.equal((await service.cancel(ctx,j.id)).status,'cancelled');
    await assert.rejects(db.query('UPDATE devices SET workspace_id=$2 WHERE id=$1',[ctx.deviceId,other.workspaceId]));
    await assert.rejects(db.query('INSERT INTO worker_heartbeats(device_id,workspace_id,session_id,agent_version,reported_status,runtime_state) VALUES($1,$2,$3,\'test\',\'online\',\'idle\')',[ctx.deviceId,other.workspaceId,randomUUID()]));
    await assert.rejects(async()=>local.sqlFile(path.resolve(__dirname,'../../src/database/migrations/007_rollback.sql')));
  });
  await t.test('effect receipts, partial send fencing, unknown outcome and one business persistence',async()=>{
    await db.query(`INSERT INTO automation_settings(workspace_id,is_active,start_hour,end_hour,min_interval_minutes,max_interval_minutes,daily_limit) VALUES(1,true,'00:00','00:00',1,1,1000)`);
    const sender=(await db.query("INSERT INTO sending_numbers(workspace_id,label,phone_number,status,is_active,health_status,daily_limit) VALUES(1,'fixture','550000000001','active',true,'healthy',1000) RETURNING id")).rows[0];
    const lead=async()=> (await db.query("INSERT INTO leads(workspace_id,name,phone,status,is_verified,is_ai_ready,custom_message) VALUES(1,'fixture',$1,'pending',true,true,'fixture message') RETURNING id",[randomUUID()])).rows[0];
    const message=async()=>{
      const l=await lead();return service.create(ctx,{type:'send_message',payload:{leadId:l.id,sendingNumberId:sender.id,messageHash:P.fingerprint('fixture message'),segmentCount:1},idempotencyKey:randomUUID()});
    };
    await ready();let job=await message();let c=await service.claim(ctx,{lane:'automation'});assert.equal(c.id,job.id);
    let input={attemptId:c.current_attempt_id};await service.mutate(ctx,job.id,'start',input);
    assert.equal((await service.effect(ctx,job.id,0,'begin',input)).execute,true);
    assert.equal((await service.effect(ctx,job.id,0,'begin',input)).execute,false);
    await service.effect(ctx,job.id,0,'ack',{...input,result:{outcome:'applied'}});
    await service.effect(ctx,job.id,0,'ack',{...input,result:{outcome:'applied'}});
    await db.query("UPDATE jobs SET leased_until=clock_timestamp()-interval '1 second' WHERE id=$1",[job.id]);
    await service.recover();assert.equal((await service.read(ctx,job.id)).status,'completed');
    await service.recover();assert.equal((await db.query('SELECT sent_today FROM sending_numbers WHERE id=$1',[sender.id])).rows[0].sent_today,1);
    assert.equal((await db.query('SELECT status FROM leads WHERE id=$1',[job.payload.leadId])).rows[0].status,'contacted');
    await ready();job=await message();c=await service.claim(ctx,{lane:'automation'});input={attemptId:c.current_attempt_id};await service.mutate(ctx,job.id,'start',input);
    await service.effect(ctx,job.id,0,'begin',input);
    await db.query("UPDATE jobs SET leased_until=clock_timestamp()-interval '1 second' WHERE id=$1",[job.id]);
    await service.recover();const unknown=await service.read(ctx,job.id);
    assert.equal(unknown.status,'failed');assert.equal(unknown.last_error_code,'EFFECT_OUTCOME_UNKNOWN');
    await assert.rejects(service.effect(ctx,job.id,0,'ack',{...input,result:{outcome:'applied'}}),{code:'STALE_LEASE'});
    assert.equal((await db.query('SELECT sent_today FROM sending_numbers WHERE id=$1',[sender.id])).rows[0].sent_today,1);
  });
  await t.test('real races, execution deadline, partial effect resume and immutable attempt history',async()=>{
    await ready();let job=await make();let c=await service.claim(ctx,{lane:'search'}), input={attemptId:c.current_attempt_id};
    await service.mutate(ctx,job.id,'start',input);
    await db.query("UPDATE jobs SET leased_until=clock_timestamp()-interval '1 second' WHERE id=$1",[job.id]);
    const race=await Promise.allSettled([service.mutate(ctx,job.id,'complete',{...input,result:{}}),service.mutate(ctx,job.id,'renew',input),service.recover(),service.recover()]);
    assert.equal(race[0].status,'rejected');assert.equal(race[1].status,'rejected');
    assert.equal((await service.read(ctx,job.id)).status,'queued');
    const history=await service.read(ctx,job.id,true);assert.equal(history[0].status,'expired');
    await service.cancel(ctx,job.id);assert.deepEqual(await service.read(ctx,job.id,true),history);
    await ready();job=await make();c=await service.claim(ctx,{lane:'search'});input={attemptId:c.current_attempt_id};await service.mutate(ctx,job.id,'start',input);
    await db.query("UPDATE job_attempts SET started_at=clock_timestamp()-interval '31 minutes' WHERE id=$1",[input.attemptId]);
    await assert.rejects(service.mutate(ctx,job.id,'renew',input),{code:'EXECUTION_TIMEOUT'});await service.recover();assert.equal((await service.read(ctx,job.id)).status,'queued');await service.cancel(ctx,job.id);
    const sender=(await db.query('SELECT id FROM sending_numbers WHERE workspace_id=1 ORDER BY id LIMIT 1')).rows[0];
    const newSend=async(segments)=>{
      const lead=(await db.query("INSERT INTO leads(workspace_id,name,phone,status,is_verified,is_ai_ready,custom_message) VALUES(1,'fixture',$1,'pending',true,true,'partial') RETURNING id",[randomUUID()])).rows[0];
      return service.create(ctx,{type:'send_message',payload:{leadId:lead.id,sendingNumberId:sender.id,messageHash:P.fingerprint('partial'),segmentCount:segments},idempotencyKey:randomUUID()});
    };
    await ready();job=await newSend(2);c=await service.claim(ctx,{lane:'automation'});input={attemptId:c.current_attempt_id};await service.mutate(ctx,job.id,'start',input);
    await assert.rejects(service.effect(ctx,job.id,1,'begin',input),{code:'EFFECT_ORDER'});
    await service.effect(ctx,job.id,0,'begin',input);
    await assert.rejects(service.effect(ctx,job.id,0,'ack',{...input,result:{outcome:'cancelled'}}),{code:'INVALID_RUNTIME_INPUT'});
    await service.effect(ctx,job.id,0,'ack',{...input,result:{outcome:'applied'}});
    await service.mutate(ctx,job.id,'fail',{...input,code:'TRANSIENT'});
    await db.query("UPDATE jobs SET available_at=clock_timestamp()-interval '1 second' WHERE id=$1",[job.id]);await ready();
    c=await service.claim(consumer2,{lane:'automation'});input={attemptId:c.current_attempt_id};await service.mutate(consumer2,job.id,'start',input);
    assert.equal((await service.effect(consumer2,job.id,0,'begin',input)).execute,false);
    await service.effect(consumer2,job.id,1,'begin',input);await service.effect(consumer2,job.id,1,'ack',{...input,result:{outcome:'applied'}});
    await service.mutate(consumer2,job.id,'complete',{...input,result:{outcome:'applied'}});
    await ready();job=await newSend(1);c=await service.claim(ctx,{lane:'automation'});input={attemptId:c.current_attempt_id};await service.mutate(ctx,job.id,'start',input);
    const cancelRace=await Promise.allSettled([service.cancel(ctx,job.id),service.effect(ctx,job.id,0,'begin',input)]);
    assert.equal(cancelRace[0].status,'fulfilled');
    const stopped=await service.mutate(ctx,job.id,'fail',{...input,code:'TRANSIENT'});
    assert.ok(['cancelled','failed'].includes(stopped.status));
    if(cancelRace[1].status==='fulfilled')assert.equal(stopped.last_error_code,'EFFECT_OUTCOME_UNKNOWN');
    else assert.equal(stopped.status,'cancelled');
    // The same business identifier is legal in another workspace, but not twice here.
    await db.query("INSERT INTO leads(workspace_id,name,phone) VALUES(1,'fixture','same-fixture-phone'),(9001,'fixture','same-fixture-phone')");
    await assert.rejects(db.query("INSERT INTO leads(workspace_id,name,phone) VALUES(1,'fixture','same-fixture-phone')"),{code:'23505'});
    // A removed result dependency must not leave an expired active lane forever.
    const ephemeralSender=(await db.query("INSERT INTO sending_numbers(workspace_id,label,phone_number,status,is_active,health_status,daily_limit) VALUES(1,'ephemeral','fixture-ephemeral','active',true,'healthy',1000) RETURNING id")).rows[0];
    const resultLead=(await db.query("INSERT INTO leads(workspace_id,name,phone,status,is_verified,is_ai_ready,custom_message) VALUES(1,'fixture',$1,'pending',true,true,'result') RETURNING id",[randomUUID()])).rows[0];
    await ready();job=await service.create(ctx,{type:'send_message',payload:{leadId:resultLead.id,sendingNumberId:ephemeralSender.id,messageHash:P.fingerprint('result'),segmentCount:1},idempotencyKey:randomUUID()});
    c=await service.claim(ctx,{lane:'automation'});input={attemptId:c.current_attempt_id};await service.mutate(ctx,job.id,'start',input);
    await service.effect(ctx,job.id,0,'begin',input);await service.effect(ctx,job.id,0,'ack',{...input,result:{outcome:'applied'}});
    await db.query('DELETE FROM sending_numbers WHERE workspace_id=1 AND id=$1',[ephemeralSender.id]);
    await db.query("UPDATE jobs SET leased_until=clock_timestamp()-interval '1 second' WHERE id=$1",[job.id]);await service.recover();
    assert.equal((await service.read(ctx,job.id)).last_error_code,'RESULT_RECONCILIATION_REQUIRED');
    assert.equal((await service.read(ctx,job.id)).status,'failed');
  });
  await t.test('Gate B: authenticated devices, real socket rooms, HTTP, stale presence and reconnect',async(t)=>{
    const runtime=createRuntimeRepository({db});
    const accessTokenService=createAccessTokenService({jwtSecret:'s'.repeat(32),jwtKeyId:'fixture',jwtIssuer:'stage7',jwtAudience:'stage7-web',accessTokenTtlSeconds:600});
    const identityService=createAuthIdentityService({db});
    for(const [id,ws] of [[7001,'1'],[7002,'9001']]) {
      await db.query("INSERT INTO users(id,name,email,password_hash,email_verified_at) VALUES($1,'fixture',$2,'test-only',clock_timestamp())",[id,`fixture${id}@example.test`]);
      await db.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[ws,id]);
    }
    const tokens=new Map();
    for(const c of [ctx,other]) {const token=require('node:crypto').randomBytes(32).toString('base64url');tokens.set(c.workspaceId,token);await db.query('UPDATE devices SET token_digest=$2 WHERE id=$1',[c.deviceId,createHash('sha256').update(token).digest()]);}
    const app=express();app.use(express.json());const server=http.createServer(app);
    const sockets=attachRuntimeSocketServer({httpServer:server,runtime,accessTokenService,identityService,logger:{info(){}}});
    assert.equal(await sockets.ready,true);
    const distributed=createJobService({db,authorizeConsumer:runtime.authorizeConsumer,onEvent:sockets.notify,logger:{info(){}}});
    app.use('/jobs',createAgentJobRouter({service:distributed,authenticate:createRequireDeviceContext({runtime}),requestLimit:1000}));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`,clients=[];
    t.after(async()=>{for(const client of clients)client.disconnect();await sockets.close();if(server.listening)await new Promise(resolve=>server.close(resolve));});
    async function connect(namespace,auth,ready=false) {
      const socket=createSocket(origin+namespace,{auth,forceNew:true,reconnection:false,transports:['websocket'],autoConnect:false});clients.push(socket);
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{socket.disconnect();reject(new Error('fixture socket timeout'));},3000);
        socket.once('connect_error',error=>{clearTimeout(timer);socket.disconnect();reject(error);});
        socket.once(ready?'runtime:ready':'connect',info=>{clearTimeout(timer);resolve({socket,info});});socket.connect();
      });
    }
    const tokenA=tokens.get('1'),tokenB=tokens.get('9001');
    await assert.rejects(connect('',{}));await assert.rejects(connect('/agent',{}));
    await assert.rejects(connect('/agent',{deviceToken:tokenA,agentVersion:'1.0.0',workspaceId:'9001'}));
    await assert.rejects(connect('/agent',{deviceToken:tokenA,agentVersion:'1.0.0',deviceId:other.deviceId}));
    const webA=(await connect('/workspace',{accessToken:accessTokenService.issue({userId:'7001',authVersion:0})})).socket;
    const webB=(await connect('/workspace',{accessToken:accessTokenService.issue({userId:'7002',authVersion:0})})).socket;
    const a=await connect('/agent',{deviceToken:tokenA,agentVersion:'1.0.0'},true),b=await connect('/agent',{deviceToken:tokenB,agentVersion:'1.0.0'},true);
    assert.equal(a.info.releaseChannel,'internal');
    assert.equal((await runtime.presence('1'))[0].status,'offline');
    await assert.rejects(connect('/agent',{deviceToken:tokenA,agentVersion:'1.0.0'}),/DEVICE_SESSION_CONFLICT/);
    const heartbeat=socket=>new Promise((resolve,reject)=>socket.timeout(2000).emit('runtime:heartbeat',{agentVersion:'1.0.0',status:'online',runtimeState:'idle'},(error,response)=>error?reject(error):resolve(response)));
    assert.equal((await heartbeat(a.socket)).ok,true);assert.equal((await heartbeat(b.socket)).ok,true);
    assert.equal((await runtime.presence('1'))[0].status,'online');
    const forgedJoin=await new Promise(resolve=>a.socket.emit('join',`device:${other.deviceId}`,resolve));assert.equal(forgedJoin.code,'ROOM_FORBIDDEN');
    assert.equal((await new Promise(resolve=>webA.emit('join','workspace:9001',resolve))).code,'ROOM_FORBIDDEN');
    const seenA=[],seenB=[],hintsB=[];webA.on('job:updated',e=>seenA.push(e));webB.on('job:updated',e=>seenB.push(e));b.socket.on('jobs:available',e=>hintsB.push(e));
    const request=async(token,session,path,body)=>{
      const r=await fetch(origin+'/jobs'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'x-leadhunt-runtime-session':session},body:JSON.stringify(body)});
      return {status:r.status,body:await r.json()};
    };
    await ready();const job=await distributed.create(ctx,{type:'search',payload,idempotencyKey:randomUUID()});
    const claimed=await request(tokenA,a.info.sessionId,'/claim',{lane:'search'});assert.equal(claimed.status,200);assert.equal(claimed.body.job.id,job.id);
    const at=claimed.body.job.attemptId;
    assert.equal((await request(tokenB,b.info.sessionId,`/${job.id}/complete`,{attemptId:at,result:{}})).status,404);
    assert.equal((await request(tokenB,b.info.sessionId,`/${job.id}/renew`,{attemptId:at})).status,404);
    await request(tokenA,a.info.sessionId,`/${job.id}/start`,{attemptId:at});
    assert.equal((await request(tokenA,a.info.sessionId,`/${job.id}/complete`,{attemptId:at,result:{savedCount:1}})).body.job.status,'completed');
    await new Promise(resolve=>setTimeout(resolve,40));assert.ok(seenA.some(e=>e.jobId===job.id));assert.equal(seenB.length,0);assert.equal(hintsB.length,0);
    // Two actual authenticated consumers operate simultaneously in distinct workspaces.
    await ready();
    const pair=await Promise.all([distributed.create(ctx,{type:'search',payload,idempotencyKey:randomUUID()}),distributed.create(other,{type:'search',payload,idempotencyKey:randomUUID()})]);
    const pairClaims=await Promise.all([request(tokenA,a.info.sessionId,'/claim',{lane:'search'}),request(tokenB,b.info.sessionId,'/claim',{lane:'search'})]);
    for(let i=0;i<2;i++)assert.equal(pairClaims[i].body.job.id,pair[i].id);
    await Promise.all(pairClaims.map((r,i)=>request(i?tokenB:tokenA,i?b.info.sessionId:a.info.sessionId,`/${r.body.job.id}/start`,{attemptId:r.body.job.attemptId})));
    await Promise.all(pairClaims.map((r,i)=>request(i?tokenB:tokenA,i?b.info.sessionId:a.info.sessionId,`/${r.body.job.id}/complete`,{attemptId:r.body.job.attemptId,result:{}})));
    // Eighty overdue followups. We advance ONLY fixture dispatch timestamps,
    // never wait 40 minutes or execute a browser. Each HTTP claim must still
    // reject a second immediate dispatch and preserve the persisted cooldown.
    await db.query("INSERT INTO automation_settings(workspace_id,is_active,start_hour,end_hour,min_interval_minutes,max_interval_minutes,daily_limit) VALUES(9001,true,'00:00','00:00',1,1,1000)");
    const senderB=(await db.query("INSERT INTO sending_numbers(workspace_id,label,phone_number,status,is_active,health_status,daily_limit) VALUES(9001,'fixture-b','550000000009','active',true,'healthy',1000) RETURNING id")).rows[0];
    const backlog=[];
    for(let i=0;i<80;i++) {
      const lead=(await db.query("INSERT INTO leads(workspace_id,name,phone,status,assigned_number,next_followup_at,followup_count) VALUES(9001,'fixture',$1,'contacted','550000000009',$2,0) RETURNING id,next_followup_at",[randomUUID(),new Date(Date.now()-3600000+i*1000)])).rows[0];
      backlog.push(await distributed.create(other,{type:'followup',payload:{leadId:lead.id,sendingNumberId:senderB.id,messageHash:P.fingerprint('fixture-followup'),segmentCount:1,followupCount:1,dueAt:lead.next_followup_at.toISOString()},scheduledAt:lead.next_followup_at.toISOString(),idempotencyKey:randomUUID()}));
    }
    await distributed.setPaused(other,'automation',true);
    assert.equal((await request(tokenB,b.info.sessionId,'/claim',{lane:'automation'})).body.job,null);
    await distributed.setPaused(other,'automation',false);
    for(const expected of backlog) {
      await db.query("UPDATE workspace_job_runtime SET next_dispatch_at=clock_timestamp()-interval '1 second' WHERE workspace_id=9001 AND lane='automation'");
      const r=await request(tokenB,b.info.sessionId,'/claim',{lane:'automation'});assert.equal(r.status,200);assert.equal(r.body.job?.id,expected.id);
      const input={attemptId:r.body.job.attemptId};
      assert.equal((await request(tokenB,b.info.sessionId,'/claim',{lane:'automation'})).body.job,null);
      await request(tokenB,b.info.sessionId,`/${expected.id}/start`,input);
      assert.equal((await request(tokenB,b.info.sessionId,`/${expected.id}/effects/0/begin`,input)).body.execute,true);
      await request(tokenB,b.info.sessionId,`/${expected.id}/effects/0/ack`,{...input,result:{outcome:'applied'}});
      const completed=await request(tokenB,b.info.sessionId,`/${expected.id}/complete`,{...input,result:{outcome:'applied'}});
      assert.equal(completed.body.job.status,'completed');
      const pacing=(await db.query("SELECT next_dispatch_at FROM workspace_job_runtime WHERE workspace_id=9001 AND lane='automation'")).rows[0];
      assert.ok(new Date(pacing.next_dispatch_at)-new Date(completed.body.job.completed_at)>=30000);
      assert.equal((await request(tokenB,b.info.sessionId,'/claim',{lane:'automation'})).body.job,null);
    }
    assert.equal((await db.query('SELECT sent_today FROM sending_numbers WHERE workspace_id=9001 AND id=$1',[senderB.id])).rows[0].sent_today,80);
    await ready();
    const interrupted=await distributed.create(ctx,{type:'search',payload,idempotencyKey:randomUUID()});
    const interruptedClaim=(await request(tokenA,a.info.sessionId,'/claim',{lane:'search'})).body.job;
    assert.equal(interruptedClaim.id,interrupted.id);P.uuid(interruptedClaim.attemptId);
    assert.equal((await request(tokenA,a.info.sessionId,`/${interrupted.id}/start`,{attemptId:interruptedClaim.attemptId})).status,200);
    await db.query("UPDATE worker_heartbeats SET last_seen_at=clock_timestamp()-interval '50 seconds' WHERE device_id=$1",[ctx.deviceId]);
    await assert.rejects(runtime.heartbeat({...await runtime.authenticate(tokenA),sessionId:a.info.sessionId},{agentVersion:'1.0.0',status:'online',runtimeState:'idle'}),{code:'STALE_SESSION'});
    await sockets.tick();assert.equal((await db.query('SELECT connected FROM worker_heartbeats WHERE device_id=$1',[ctx.deviceId])).rows[0].connected,false);
    assert.equal((await distributed.read(ctx,interrupted.id)).status,'running');
    const fresh=await connect('/agent',{deviceToken:tokenA,agentVersion:'1.0.0'},true);assert.notEqual(fresh.info.sessionId,a.info.sessionId);
    await heartbeat(fresh.socket);
    await runtime.disconnect({...await runtime.authenticate(tokenA),sessionId:a.info.sessionId});
    assert.equal((await db.query('SELECT connected FROM worker_heartbeats WHERE device_id=$1',[ctx.deviceId])).rows[0].connected,true);
    assert.equal((await request(tokenA,a.info.sessionId,'/claim',{lane:'search'})).status,409);
    const staleRenew=await request(tokenA,fresh.info.sessionId,`/${interrupted.id}/renew`,{attemptId:interruptedClaim.attemptId});
    assert.deepEqual(staleRenew,{status:409,body:{code:'STALE_LEASE',error:'Operação de execução indisponível.'}});
    await db.query("UPDATE jobs SET leased_until=clock_timestamp()-interval '1 second' WHERE id=$1",[interrupted.id]);await distributed.recover();
    await db.query("UPDATE jobs SET available_at=clock_timestamp()-interval '1 second' WHERE id=$1",[interrupted.id]);await ready();
    const resumed=(await request(tokenA,fresh.info.sessionId,'/claim',{lane:'search'})).body.job;
    assert.equal(resumed.id,interrupted.id);assert.equal(resumed.attempt_count,2);
    await request(tokenA,fresh.info.sessionId,`/${resumed.id}/start`,{attemptId:resumed.attemptId});
    const authA={...await runtime.authenticate(tokenA),sessionId:fresh.info.sessionId};
    await runtime.heartbeat(authA,{agentVersion:'1.0.0',status:'online',runtimeState:'paused'});
    assert.equal((await request(tokenA,fresh.info.sessionId,'/claim',{lane:'search'})).status,409);
    assert.equal((await request(tokenA,fresh.info.sessionId,`/${resumed.id}/renew`,{attemptId:resumed.attemptId})).status,200);
    assert.equal((await request(tokenA,fresh.info.sessionId,`/${resumed.id}/complete`,{attemptId:resumed.attemptId,result:{}})).body.job.status,'completed');
    await runtime.heartbeat(authA,{agentVersion:'1.0.0',status:'degraded',runtimeState:'idle'});assert.equal((await runtime.presence('1'))[0].status,'degraded');
    await runtime.heartbeat(authA,{agentVersion:'1.0.0',status:'updating',runtimeState:'paused'});
    assert.equal((await request(tokenA,fresh.info.sessionId,'/claim',{lane:'search'})).status,409);
    await runtime.heartbeat(authA,{agentVersion:'1.0.0',status:'online',runtimeState:'idle'});
    await db.query("UPDATE devices SET revoked_at=clock_timestamp() WHERE id=$1",[ctx.deviceId]);await sockets.tick();
    await assert.rejects(runtime.authenticate(tokenA),{code:'INVALID_DEVICE'});
    await db.query('UPDATE devices SET revoked_at=NULL WHERE id=$1',[ctx.deviceId]);
    await db.query("UPDATE devices SET token_expires_at=created_at+interval '1 second' WHERE id=$1",[ctx.deviceId]);await assert.rejects(runtime.authenticate(tokenA),{code:'INVALID_DEVICE'});
    await db.query("UPDATE devices SET token_expires_at=clock_timestamp()+interval '1 day' WHERE id=$1",[ctx.deviceId]);
    for(const status of ['pending','suspended']) {
      await db.query('UPDATE workspaces SET account_status=$2 WHERE id=$1',[other.workspaceId,status]);
      await assert.rejects(runtime.authenticate(tokenB),{code:'INVALID_DEVICE'});
      await assert.rejects(connect('/workspace',{accessToken:accessTokenService.issue({userId:'7002',authVersion:0})}));
      await db.query("UPDATE workspaces SET account_status='active' WHERE id=$1",[other.workspaceId]);
    }
    const aIds=new Set((await db.query('SELECT id FROM jobs WHERE workspace_id=1')).rows.map(j=>j.id));assert.ok(seenB.every(e=>!aIds.has(e.jobId)));
    await assert.rejects(async()=>local.sqlFile(path.resolve(__dirname,'../../src/database/migrations/008_rollback.sql')));
  });
  await t.test('legacy bridge uses real advisory lock and never changes workspace B',async()=>{
    const {acquireLegacyWorkerLease}=require('../../src/services/legacyWorkerLease');
    const {createNumberRoutingService}=require('../../src/services/numberRoutingService');
    const {createFollowupService}=require('../../src/services/followupService');
    const {createWorkspaceLeadEvent}=require('../../src/services/eventService');
    await db.query('UPDATE devices SET revoked_at=clock_timestamp() WHERE workspace_id=1');
    const lease=await acquireLegacyWorkerLease({db,workspaceId:'1'});
    try {
      await assert.rejects(acquireLegacyWorkerLease({db,workspaceId:'1'}),{code:'LEGACY_WORKER_ALREADY_RUNNING'});
      await lease.assertActive();
      const n=createNumberRoutingService({db}),f=createFollowupService({db});
      const b=(await db.query('SELECT * FROM sending_numbers WHERE workspace_id=9001 ORDER BY id LIMIT 1')).rows[0];
      assert.equal((await n.incrementNumberUsage('1',b.phone_number)).rowCount,0);
      await n.clearExpiredPauses('1');await n.resetDailyCountersIfNeeded('1');
      assert.equal((await db.query('SELECT sent_today FROM sending_numbers WHERE id=$1',[b.id])).rows[0].sent_today,b.sent_today);
      const lead=(await db.query('SELECT id,next_followup_at FROM leads WHERE workspace_id=9001 AND next_followup_at IS NOT NULL LIMIT 1')).rows[0];
      await f.stopFollowupForLead('1',lead.id);
      assert.equal((await db.query('SELECT next_followup_at FROM leads WHERE id=$1',[lead.id])).rows[0].next_followup_at.getTime(),lead.next_followup_at.getTime());
      await assert.rejects(createWorkspaceLeadEvent('1',lead.id,'fixture',null,'test',{},db));
    } finally {await lease.close();}
    const replacement=await acquireLegacyWorkerLease({db,workspaceId:'1'});await replacement.close();
  });
  assert.ok(events.some(([e])=>e==='job claimed'));
});
