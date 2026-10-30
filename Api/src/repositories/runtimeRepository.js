const {createHash,randomUUID}=require('node:crypto');
const P=require('../services/jobPolicy');
function digest(token) {
  if (typeof token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) P.reject('INVALID_DEVICE',401);
  return createHash('sha256').update(token).digest();
}
function createRuntimeRepository({db}) {
  async function authenticate(token) {
    const credentialDigest=digest(token);
    const row=(await db.query(`SELECT d.id,d.workspace_id,w.release_channel FROM public.devices d JOIN public.workspaces w ON w.id=d.workspace_id
      WHERE d.token_digest=$1 AND d.revoked_at IS NULL AND d.token_expires_at>clock_timestamp() AND w.is_active AND w.account_status='active'`,[credentialDigest])).rows[0];
    if (!row) P.reject('INVALID_DEVICE',401);
    return {deviceId:row.id,workspaceId:row.workspace_id,releaseChannel:row.release_channel,credentialDigest};
  }
  async function authorized(client,ctx) {
    P.workspace(ctx.workspaceId);P.uuid(ctx.deviceId);
    const row=(await client.query(`SELECT d.id FROM public.devices d JOIN public.workspaces w ON w.id=d.workspace_id
      WHERE d.workspace_id=$1 AND d.id=$2 AND d.token_digest=$3 AND d.revoked_at IS NULL
      AND d.token_expires_at>clock_timestamp() AND w.is_active AND w.account_status='active' FOR SHARE OF d,w`,[ctx.workspaceId,ctx.deviceId,ctx.credentialDigest])).rows[0];
    if (!row) P.reject('INVALID_DEVICE',401);
  }
  async function authorizeConsumer(client,ctx,{allowPaused=false}={}) {
    await authorized(client,ctx); P.uuid(ctx.sessionId);
    if (!(await client.query(`SELECT 1 FROM public.worker_heartbeats WHERE workspace_id=$1 AND device_id=$2 AND session_id=$3 AND connected
      AND last_seen_at>clock_timestamp()-interval '45 seconds' AND ($4::boolean OR (reported_status<>'updating' AND runtime_state<>'paused')) FOR SHARE`,[ctx.workspaceId,ctx.deviceId,ctx.sessionId,allowPaused])).rowCount) P.reject('DEVICE_OFFLINE',409);
  }
  async function connect(ctx,agentVersion) {
    if (typeof agentVersion!=='string' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(agentVersion) || agentVersion.length>64) P.reject();
    const client=await db.connect();
    try {
      await client.query('BEGIN');
      // Serialize session replacement by the device row, not an in-memory map.
      await client.query('SELECT id FROM public.workspaces WHERE id=$1 FOR SHARE',[ctx.workspaceId]);
      await client.query('SELECT id FROM public.devices WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[ctx.workspaceId,ctx.deviceId]);
      await authorized(client,ctx);
      const h=(await client.query("SELECT *,COALESCE(last_seen_at,updated_at)>clock_timestamp()-interval '45 seconds' AS fresh FROM public.worker_heartbeats WHERE workspace_id=$1 AND device_id=$2 FOR UPDATE",[ctx.workspaceId,ctx.deviceId])).rows[0];
      if (h?.connected && h.fresh) P.reject('DEVICE_SESSION_CONFLICT');
      const sessionId=randomUUID();
      await client.query(`INSERT INTO public.worker_heartbeats(device_id,workspace_id,session_id,connected,last_seen_at,agent_version,reported_status,runtime_state)
        VALUES($1,$2,$3,true,NULL,$4,'online','paused') ON CONFLICT(device_id) DO UPDATE SET session_id=EXCLUDED.session_id,connected=true,last_seen_at=NULL,agent_version=EXCLUDED.agent_version,reported_status='online',runtime_state='paused',updated_at=clock_timestamp()`,[ctx.deviceId,ctx.workspaceId,sessionId,agentVersion]);
      await client.query('COMMIT');return {...ctx,sessionId};
    } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;} finally {client.release();}
  }
  async function heartbeat(ctx,input) {
    P.exact(input,['agentVersion','status','runtimeState']);
    if (typeof input.agentVersion!=='string' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(input.agentVersion) || input.agentVersion.length>64 || !['online','degraded','updating'].includes(input.status) || !['idle','busy','paused'].includes(input.runtimeState)) P.reject();
    const client=await db.connect();
    try {
      await client.query('BEGIN');await authorized(client,ctx);
      const row=(await client.query(`UPDATE public.worker_heartbeats SET last_seen_at=clock_timestamp(),updated_at=clock_timestamp(),agent_version=$4,reported_status=$5,runtime_state=$6
        WHERE workspace_id=$1 AND device_id=$2 AND session_id=$3 AND connected AND COALESCE(last_seen_at,updated_at)>clock_timestamp()-interval '45 seconds' RETURNING *`,[ctx.workspaceId,ctx.deviceId,ctx.sessionId,input.agentVersion,input.status,input.runtimeState])).rows[0];
      if (!row) P.reject('STALE_SESSION');
      await client.query('COMMIT');return row;
    } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;} finally {client.release();}
  }
  async function disconnect(ctx) {return (await db.query('UPDATE public.worker_heartbeats SET connected=false,updated_at=clock_timestamp() WHERE workspace_id=$1 AND device_id=$2 AND session_id=$3 AND connected RETURNING *',[ctx.workspaceId,ctx.deviceId,ctx.sessionId])).rows[0];}
  async function sweep() {
    return (await db.query(`UPDATE public.worker_heartbeats h SET connected=false,updated_at=clock_timestamp()
      FROM public.devices d,public.workspaces w WHERE d.id=h.device_id AND d.workspace_id=h.workspace_id AND w.id=h.workspace_id AND h.connected
      AND (COALESCE(h.last_seen_at,h.updated_at)<=clock_timestamp()-interval '45 seconds' OR d.revoked_at IS NOT NULL OR d.token_expires_at<=clock_timestamp() OR NOT w.is_active OR w.account_status<>'active') RETURNING h.*`)).rows;
  }
  async function initialize() {
    const r=await db.query("SELECT to_regclass('public.worker_heartbeats') AS presence,to_regclass('public.jobs') AS jobs,to_regclass('public.ux_jobs_v1_active_lane') AS lane_policy");
    if (!r.rows[0]?.presence || !r.rows[0]?.jobs || !r.rows[0]?.lane_policy) P.reject('RUNTIME_UNAVAILABLE',503);
    if((await db.query("SELECT version FROM public.schema_migrations WHERE version IN ('007','008')")).rowCount!==2)P.reject('RUNTIME_UNAVAILABLE',503);
    await db.query('UPDATE public.worker_heartbeats SET connected=false,updated_at=clock_timestamp() WHERE connected');
  }
  async function presence(workspaceId) {
    P.workspace(workspaceId);
    return (await db.query(`SELECT h.device_id,h.workspace_id,h.last_seen_at,h.agent_version,
      CASE WHEN h.connected AND h.last_seen_at>clock_timestamp()-interval '45 seconds' AND d.revoked_at IS NULL AND d.token_expires_at>clock_timestamp() THEN h.reported_status ELSE 'offline' END AS status
      FROM public.worker_heartbeats h JOIN public.devices d ON d.id=h.device_id AND d.workspace_id=h.workspace_id WHERE h.workspace_id=$1`,[workspaceId])).rows;
  }
  return Object.freeze({authenticate,authorized,authorizeConsumer,connect,heartbeat,disconnect,sweep,initialize,presence});
}
module.exports={createRuntimeRepository};
