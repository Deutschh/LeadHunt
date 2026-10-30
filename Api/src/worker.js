// Trusted internal legacy runner only. Never distribute this as the Agent.
async function runLegacyWorker({db,workspaceId,startAutomation}) {
  const {acquireLegacyWorkerLease}=require('./services/legacyWorkerLease');
  const lease=await acquireLegacyWorkerLease({db,workspaceId});
  try {await startAutomation(lease);return lease;}
  catch(error) {await lease.close();throw error;}
}
if(require.main===module) {
  require('dotenv').config();
  runLegacyWorker({db:require('./database/db'),workspaceId:process.env.LEGACY_WORKSPACE_ID,startAutomation:require('./services/automationEngine').startAutomation})
    .catch(()=>{console.error('LEGACY_WORKER_START_REJECTED');process.exitCode=1;});
}
module.exports={runLegacyWorker};
