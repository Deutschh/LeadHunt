const {workspace}=require('./jobPolicy');
function createNumberRoutingService({db}) {
  const query=(ws,sql,params=[])=>{workspace(ws);return db.query(sql,[ws,...params]);};
  async function resetDailyCountersIfNeeded(ws) {
    await query(ws,"UPDATE sending_numbers SET sent_today=0,last_reset_at=NOW() WHERE workspace_id=$1 AND (last_reset_at IS NULL OR DATE(last_reset_at)<CURRENT_DATE)");
  }
  async function getAvailableSendingNumber(ws) {
    await resetDailyCountersIfNeeded(ws);
    return (await query(ws,"SELECT * FROM sending_numbers WHERE workspace_id=$1 AND is_active=true AND status='active' AND COALESCE(health_status,'healthy') IN ('healthy','warning') AND COALESCE(sent_today,0)<COALESCE(daily_limit,0) AND chrome_port IS NOT NULL AND (paused_until IS NULL OR paused_until<=NOW()) ORDER BY sent_today,created_at LIMIT 1")).rows[0] || null;
  }
  async function assignNumberToLead(ws,leadId,sender) {
    return query(ws,"UPDATE leads SET assigned_number=$3 WHERE workspace_id=$1 AND id=$2 AND EXISTS (SELECT 1 FROM sending_numbers WHERE workspace_id=$1 AND id=$4 AND phone_number=$3)",[leadId,sender.phone_number,sender.id]);
  }
  async function incrementNumberUsage(ws,phone) {return query(ws,'UPDATE sending_numbers SET sent_today=sent_today+1 WHERE workspace_id=$1 AND phone_number=$2',[phone]);}
  async function getLeadAssignedNumber(ws,id) {return (await query(ws,'SELECT assigned_number FROM leads WHERE workspace_id=$1 AND id=$2',[id])).rows[0]?.assigned_number || null;}
  async function getSendingNumberByPhone(ws,phone) {return (await query(ws,'SELECT * FROM sending_numbers WHERE workspace_id=$1 AND phone_number=$2 LIMIT 1',[phone])).rows[0] || null;}
  async function markNumberHealthy(ws,phone) {return query(ws,"UPDATE sending_numbers SET health_status='healthy',last_health_check_at=NOW(),last_error=NULL,consecutive_failures=0,paused_until=NULL WHERE workspace_id=$1 AND phone_number=$2",[phone]);}
  async function markNumberFailure(ws,phone) {
    // Atomic increment; never persist a raw browser exception.
    return query(ws,"UPDATE sending_numbers SET consecutive_failures=COALESCE(consecutive_failures,0)+1,health_status=CASE WHEN COALESCE(consecutive_failures,0)+1>=3 THEN 'paused' ELSE 'warning' END,paused_until=CASE WHEN COALESCE(consecutive_failures,0)+1>=3 THEN NOW()+interval '30 minutes' ELSE NULL END,last_error='LOCAL_EXECUTION_FAILED',last_health_check_at=NOW() WHERE workspace_id=$1 AND phone_number=$2",[phone]);
  }
  async function clearExpiredPauses(ws) {return query(ws,"UPDATE sending_numbers SET paused_until=NULL,health_status='healthy',consecutive_failures=0,last_error=NULL,last_health_check_at=NOW() WHERE workspace_id=$1 AND paused_until IS NOT NULL AND paused_until<=NOW()");}
  return {resetDailyCountersIfNeeded,getAvailableSendingNumber,assignNumberToLead,incrementNumberUsage,getLeadAssignedNumber,getSendingNumberByPhone,markNumberHealthy,markNumberFailure,clearExpiredPauses};
}
const names=['resetDailyCountersIfNeeded','getAvailableSendingNumber','assignNumberToLead','incrementNumberUsage','getLeadAssignedNumber','getSendingNumberByPhone','markNumberHealthy','markNumberFailure','clearExpiredPauses'];
module.exports={createNumberRoutingService,...Object.fromEntries(names.map(name=>[name,(...args)=>createNumberRoutingService({db:require('../database/db')})[name](...args)]))};
