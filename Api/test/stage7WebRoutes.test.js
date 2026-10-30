const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const express=require('express');
const {createJobWebRouter}=require('../src/routes/jobRoutes');
const {createRequireOperationalAccess}=require('../src/middleware/requireOperationalAccess');
test('all web jobs, attempts and cancellation require authentication AND operational access; account remains independent',async(t)=>{
  let calls=0;
  const service=Object.fromEntries(['list','read','cancel'].map(name=>[name,async()=>{calls++;return name==='list' ? []:{};}]));
  const auth=(req,res,next)=>{
    const mode=req.headers['x-fixture-state'];if(!mode)return res.status(401).end();
    req.workspaceId='1';req.user={id:'1'};req.membership={userId:'1',workspaceId:'1',role:'owner'};
    req.workspace={id:'1',accountStatus:mode==='inactive'?'active':mode,isActive:mode!=='inactive'};next();
  };
  const app=express();app.use(express.json());
  app.get('/account',auth,(_req,res)=>res.json({account:true}));
  app.use('/jobs',createJobWebRouter({service,requireAuthenticatedContext:auth,requireOperationalAccess:createRequireOperationalAccess()}));
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const id='123e4567-e89b-42d3-a456-426614174000';
  for(const state of [null,'pending','suspended','inactive']) {
    for(const [url,method] of [['/jobs','GET'],[`/jobs/${id}`,'GET'],[`/jobs/${id}/attempts`,'GET'],[`/jobs/${id}/cancel`,'POST']]) {
      const response=await fetch(origin+url,{method,headers:state?{'x-fixture-state':state}:{}});assert.equal(response.status,state?403:401);
    }
    if(state)assert.equal((await fetch(origin+'/account',{headers:{'x-fixture-state':state}})).status,200);
  }
  assert.equal(calls,0);
  assert.equal((await fetch(origin+'/jobs',{headers:{'x-fixture-state':'active'}})).status,200);assert.equal(calls,1);
});
