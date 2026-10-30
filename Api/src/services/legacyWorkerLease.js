// Temporary trusted internal Worker bridge. NOT an Agent credential model.
const {RuntimeError}=require('./jobPolicy');
async function acquireLegacyWorkerLease({db,workspaceId}) {
  if (workspaceId!=='1') throw new RuntimeError('LEGACY_INTERNAL_WORKSPACE_REQUIRED',503);
  const client=await db.connect();let active=true,closed=false;
  const lost=()=>{active=false;};client.on?.('error',lost);client.on?.('end',lost);
  async function assertActive() {
    if (!active) throw new RuntimeError('LEGACY_WORKER_LOCK_LOST',503);
    const row=(await client.query("SELECT id FROM public.workspaces WHERE id=$1 AND slug='internal-main' AND release_channel='internal' AND account_status='active' AND is_active",[workspaceId])).rows[0];
    if (!row) throw new RuntimeError('LEGACY_INTERNAL_WORKSPACE_REQUIRED',503);
    const hasDevices=(await client.query("SELECT to_regclass('public.devices') AS present")).rows[0]?.present;
    if (hasDevices && (await client.query('SELECT 1 FROM public.devices WHERE workspace_id=$1 AND revoked_at IS NULL AND token_expires_at>clock_timestamp() LIMIT 1',[workspaceId])).rowCount) throw new RuntimeError('LEGACY_DISTRIBUTED_CUTOVER_REQUIRED',503);
  }
  async function close() {
    if(closed)return;closed=true;active=false;
    await client.query('SELECT pg_advisory_unlock(741007,1)').catch(()=>{});
    client.off?.('error',lost);client.off?.('end',lost);client.release();
  }
  try {
    if (!(await client.query('SELECT pg_try_advisory_lock(741007,1) AS acquired')).rows[0].acquired) throw new RuntimeError('LEGACY_WORKER_ALREADY_RUNNING',503);
    await assertActive();return {workspaceId,assertActive,close};
  } catch(error) {await close();throw error;}
}
module.exports={acquireLegacyWorkerLease};
