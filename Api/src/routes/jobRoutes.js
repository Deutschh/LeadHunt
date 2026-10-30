const express=require('express');
const {rateLimit}=require('express-rate-limit');
const P=require('../services/jobPolicy');
const {jobSummary}=require('../services/jobService');
function handler(operation,{logger=console}={}) {
  return async(req,res)=>{
    try { await operation(req,res); }
    catch(error) {
      const known=error instanceof P.RuntimeError;
      const unavailable=['42P01','42703','ECONNREFUSED','ETIMEDOUT'].includes(error.code);
      if (!known) P.runtimeLog(logger,'runtime request failed');
      return res.status(known ? error.status:unavailable ? 503:500).json({code:known ? error.code:unavailable ? 'RUNTIME_UNAVAILABLE':'RUNTIME_INTERNAL_ERROR',error:'Operação de execução indisponível.'});
    }
  };
}
function noStore(_req,res,next) {res.set('Cache-Control','no-store');next();}
function createJobWebRouter({service,requireAuthenticatedContext,requireOperationalAccess,logger=console}) {
  if (typeof requireAuthenticatedContext!=='function' || typeof requireOperationalAccess!=='function') throw new TypeError('Jobs require authentication AND operational workspace gate');
  const router=express.Router();
  // This gate is deliberately independent of /account's contract.
  router.use(noStore,requireAuthenticatedContext,requireOperationalAccess);
  router.use(rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
  const wrap=(fn)=>handler(fn,{logger});
  router.get('/',wrap(async(req,res)=>{P.exact(req.query,[]);res.json({jobs:(await service.list({workspaceId:req.workspaceId})).map(jobSummary)});}));
  router.get('/:id',wrap(async(req,res)=>res.json({job:jobSummary(await service.read({workspaceId:req.workspaceId},req.params.id))})));
  router.get('/:id/attempts',wrap(async(req,res)=>res.json({attempts:await service.read({workspaceId:req.workspaceId},req.params.id,true)})));
  router.post('/:id/cancel',wrap(async(req,res)=>{
    P.exact(req.body || {},[]);
    const job=await service.cancel({workspaceId:req.workspaceId},req.params.id);
    res.status(job.status==='running' ? 202:200).json({job:jobSummary(job)});
  }));
  return router;
}
function leaseView(job) {return job && {...jobSummary(job),payload:job.payload,attemptId:job.current_attempt_id,leasedUntil:job.leased_until};}
function createAgentJobRouter({service,authenticate,logger=console,requestLimit=240}) {
  const router=express.Router();
  router.use(noStore,authenticate);
  router.use(rateLimit({windowMs:60000,limit:requestLimit,standardHeaders:'draft-7',legacyHeaders:false}));
  const wrap=(fn)=>handler(fn,{logger});
  router.post('/claim',wrap(async(req,res)=>res.json({job:leaseView(await service.claim(req.deviceContext,req.body))})));
  for (const action of ['start','renew','complete','fail']) router.post(`/:id/${action}`,wrap(async(req,res)=>res.json({job:leaseView(await service.mutate(req.deviceContext,req.params.id,action,req.body))})));
  for (const action of ['begin','ack']) router.post(`/:id/effects/:ordinal/${action}`,wrap(async(req,res)=>{
    if (!/^[0-7]$/.test(req.params.ordinal)) P.reject();
    res.json(await service.effect(req.deviceContext,req.params.id,Number(req.params.ordinal),action,req.body));
  }));
  return router;
}
module.exports={handler,noStore,createJobWebRouter,createAgentJobRouter};
