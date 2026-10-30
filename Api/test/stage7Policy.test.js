const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../src/services/jobPolicy');
test('job payloads reject arbitrary secrets, types, IDs and invalid limits',()=>{
  const p={niche:'Clinicas',location:'Sorocaba',limit:10,minRating:4,minReviews:0,websiteFilter:'any'};
  assert.equal(P.definition('search',p,'key').lane,'search');
  for (const payload of [{...p,token:'forbidden'},{...p,limit:Infinity},{...p,minRating:NaN},{...p,workspaceId:'2'}]) assert.throws(()=>P.definition('search',payload,'key'),P.RuntimeError);
  assert.throws(()=>P.workspace('9223372036854775808'));
  assert.throws(()=>P.definition('shell',{},'key'));
  assert.throws(()=>P.resultSummary({conversation:'private'}));
  assert.throws(()=>P.reject('STALE_LEASE'),{status:409});
  assert.throws(()=>P.reject(),{status:400});
});
test('canonical idempotency and bounded nonzero exponential retry',()=>{
  assert.equal(P.fingerprint({a:1,b:2}),P.fingerprint({b:2,a:1}));
  assert.equal(P.retrySeconds(1,()=>0),30);
  assert.equal(P.retrySeconds(2,()=>0),60);
  assert.equal(P.retrySeconds(20,()=>1),900);
});
test('dispatch policy gates pause, followups, window and invalid configuration',()=>{
  const s={is_active:true,followup_enabled:true,followups_per_cycle:2,followup_gap_seconds:30,min_interval_minutes:10,max_interval_minutes:20,daily_limit:30,start_hour:'09:00:00',end_hour:'18:00:00',timezone:'America/Sao_Paulo'};
  const now=new Date('2026-10-30T15:00:00Z');
  assert.equal(P.dispatchPolicy(s,now,'followup').cooldownSeconds,30);
  for (const change of [{is_active:false},{followup_enabled:false},{followups_per_cycle:0},{followup_gap_seconds:-1},{timezone:'invalid'}]) assert.equal(P.dispatchPolicy({...s,...change},now,'followup').allowed,false);
  assert.equal(P.dispatchPolicy(s,new Date('2026-10-30T23:00:00Z'),'followup').allowed,false);
});
test('logs allow only operational metadata',()=>{
  const calls=[];P.runtimeLog({info:(...v)=>calls.push(v)},'job failed',{workspaceId:'1',token:'secret',message:'private',errorCode:'DEFINITIVE'});
  assert.ok(Number.isFinite(Date.parse(calls[0][1].at)));delete calls[0][1].at;
  assert.deepEqual(calls,[['job failed',{workspaceId:'1',errorCode:'DEFINITIVE'}]]);
});
