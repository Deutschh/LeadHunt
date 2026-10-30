const test=require('node:test');
const assert=require('node:assert/strict');
const {createNumberRoutingService}=require('../src/services/numberRoutingService');
const {createFollowupService}=require('../src/services/followupService');
const {acquireLegacyWorkerLease}=require('../src/services/legacyWorkerLease');
test('legacy number and followup repositories require workspace and scope every query',async()=>{
  const calls=[];
  const db={query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql.includes('followup_enabled'))return {rows:[{followup_enabled:true,followup_max_count:2,followup_delay_hours_1:24,followup_delay_hours_2:72}],rowCount:1};
    return {rows:[],rowCount:0};
  }};
  const n=createNumberRoutingService({db});
  await n.getAvailableSendingNumber('1');await n.assignNumberToLead('1',7,{id:4,phone_number:'fixture'});await n.incrementNumberUsage('1','fixture');
  await n.getLeadAssignedNumber('1',7);await n.getSendingNumberByPhone('1','fixture');await n.markNumberHealthy('1','fixture');await n.markNumberFailure('1','fixture','private');await n.clearExpiredPauses('1');
  const f=createFollowupService({db});await f.getEligibleFollowupLead('1');await f.scheduleNextFollowup('1',7,1);await f.markLeadAsReplied('1',7);await f.clearNextFollowup('1',7);await f.stopFollowupForLead('1',7);
  for(const {sql,params} of calls) {assert.match(sql,/workspace_id\s*=\s*\$\d/);assert.ok(params.includes('1'));assert.doesNotMatch(sql,/private/);}
  await assert.rejects(n.getAvailableSendingNumber(undefined));await assert.rejects(f.getEligibleFollowupLead(undefined));
});
test('legacy entry requires internal explicit workspace and rejects a second runner',async()=>{
  await assert.rejects(acquireLegacyWorkerLease({workspaceId:undefined,db:{}}),{code:'LEGACY_INTERNAL_WORKSPACE_REQUIRED'});
  await assert.rejects(acquireLegacyWorkerLease({workspaceId:'2',db:{}}),{code:'LEGACY_INTERNAL_WORKSPACE_REQUIRED'});
  let released=false;
  const client={on(){},query:async(sql)=>({rows:[{acquired:!sql.includes('try_advisory')}]}),release(){released=true;}};
  await assert.rejects(acquireLegacyWorkerLease({workspaceId:'1',db:{connect:async()=>client}}),{code:'LEGACY_WORKER_ALREADY_RUNNING'});assert.equal(released,true);
});
