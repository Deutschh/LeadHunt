const { randomUUID } = require('node:crypto');
const P = require('./jobPolicy');

// All state changes use one checked-out PostgreSQL client. No external effect
// or socket delivery is performed inside a database transaction.
function createJobService({ db, authorizeConsumer = async () => P.reject('RUNTIME_UNAVAILABLE',503), logger = console, random = Math.random, onEvent = async () => {} }) {
  async function transaction(workspaceId, operation, recovery = false) {
    P.workspace(workspaceId);
    const client = await db.connect();
    const events = [];
    let value;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '10s'");
      const { rows } = await client.query('SELECT * FROM public.workspaces WHERE id=$1 FOR SHARE', [workspaceId]);
      const w = rows[0];
      if (!w) P.reject('NOT_FOUND',404);
      if (!recovery && (!w.is_active || w.account_status !== 'active')) P.reject('WORKSPACE_NOT_OPERATIONAL',403);
      value = await operation(client, w, (name, fields) => events.push({name, fields:{workspaceId,...fields}}));
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (['42P01','42703'].includes(error.code)) throw new P.RuntimeError('RUNTIME_UNAVAILABLE',503);
      throw error;
    } finally { client.release(); }
    for (const event of events) {
      P.runtimeLog(logger, event.name, event.fields);
      try { await onEvent(event.name,event.fields); } catch { P.runtimeLog(logger,'runtime notification failed'); }
    }
    return value;
  }
  async function now(client) { return (await client.query('SELECT clock_timestamp() AS now')).rows[0].now; }
  async function lane(client, workspaceId, name) {
    await client.query(`INSERT INTO public.workspace_job_runtime(workspace_id,lane,is_paused)
      VALUES($1,$2,FALSE) ON CONFLICT DO NOTHING`,[workspaceId,name]);
    return (await client.query('SELECT * FROM public.workspace_job_runtime WHERE workspace_id=$1 AND lane=$2 FOR UPDATE',[workspaceId,name])).rows[0];
  }
  async function lockedJob(client, ctx, id) {
    P.uuid(id);
    const info = (await client.query('SELECT lane FROM public.jobs WHERE workspace_id=$1 AND id=$2',[ctx.workspaceId,id])).rows[0];
    if (!info) P.reject('NOT_FOUND',404);
    await lane(client,ctx.workspaceId,info.lane);
    return (await client.query('SELECT * FROM public.jobs WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[ctx.workspaceId,id])).rows[0];
  }
  async function settings(client, workspaceId, w) {
    const row = (await client.query('SELECT * FROM public.automation_settings WHERE workspace_id=$1',[workspaceId])).rows[0];
    return row && {...row,timezone:w.timezone};
  }
  async function eligible(client, job, w, time) {
    if (job.type === 'search') return {allowed:true,cooldownSeconds:1};
    const config = await settings(client,job.workspace_id,w);
    const policy = P.dispatchPolicy(config,time,job.type);
    if (!policy.allowed) return policy;
    const lead = (await client.query('SELECT * FROM public.leads WHERE workspace_id=$1 AND id=$2 FOR SHARE',[job.workspace_id,job.payload.leadId])).rows[0];
    const sender = (await client.query('SELECT * FROM public.sending_numbers WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[job.workspace_id,job.payload.sendingNumberId])).rows[0];
    if (!lead || !sender) return {allowed:false,obsolete:true};
    if (lead.is_archived || lead.is_invalid_number || lead.last_reply_at || !['pending','contacted'].includes(lead.status)) return {allowed:false,obsolete:true};
    if (!sender.is_active || sender.status !== 'active' || !['healthy','warning'].includes(sender.health_status) || (sender.paused_until && new Date(sender.paused_until)>time) || Number(sender.sent_today)>=Number(sender.daily_limit)) return {allowed:false};
    // Legacy counters are read conservatively; no historical timestamp conversion.
    const usage = await client.query('SELECT COALESCE(sum(sent_today),0)::int AS used FROM public.sending_numbers WHERE workspace_id=$1',[job.workspace_id]);
    if (usage.rows[0].used >= Number(config.daily_limit)) return {allowed:false};
    if (lead.snooze_until && new Date(lead.snooze_until)>time) return {allowed:false};
    if (job.type === 'send_message' && (lead.status !== 'pending' || !lead.is_verified || !lead.is_ai_ready || P.fingerprint(lead.custom_message || '') !== job.payload.messageHash)) return {allowed:false,obsolete:true};
    if (job.type === 'followup' && (lead.status !== 'contacted' || lead.assigned_number !== sender.phone_number || Number(lead.followup_count || 0)+1 !== job.payload.followupCount || job.payload.followupCount>Number(config.followup_max_count) || !lead.next_followup_at || new Date(lead.next_followup_at).getTime() !== Date.parse(job.payload.dueAt) || Date.parse(job.payload.dueAt)>time.getTime())) return {allowed:false,obsolete:true};
    // Initial approaches retain the configured random interval; follow-ups use gap.
    if (job.type === 'send_message') policy.cooldownSeconds = (config.min_interval_minutes + Math.floor(random()*(config.max_interval_minutes-config.min_interval_minutes+1))) * 60;
    return policy;
  }
  async function attempt(client,ctx,job,attemptId,allowLeased = false) {
    P.uuid(attemptId); P.uuid(ctx.deviceId); P.uuid(ctx.sessionId);
    if (job.current_attempt_id !== attemptId || job.leased_by !== ctx.deviceId || !['running',...(allowLeased ? ['leased'] : [])].includes(job.status)) P.reject('STALE_LEASE');
    const row = (await client.query('SELECT * FROM public.job_attempts WHERE workspace_id=$1 AND job_id=$2 AND id=$3 FOR UPDATE',[ctx.workspaceId,job.id,attemptId])).rows[0];
    const time = await now(client);
    if (!row || row.consumer_session_id !== ctx.sessionId || new Date(job.leased_until)<=time) P.reject('STALE_LEASE');
    const limit = P.definition(job.type,job.payload,job.idempotency_key).timeoutSeconds;
    if (row.started_at && time-new Date(row.started_at)>=limit*1000) P.reject('EXECUTION_TIMEOUT');
    return {row,time};
  }
  async function terminal(client,job,attemptRow,status,code,result,time,emit) {
    const attemptStatus = ['LEASE_EXPIRED','EXECUTION_TIMEOUT'].includes(code) ? 'expired' : status === 'queued' ? 'failed' : status;
    if (attemptRow) await client.query(`UPDATE public.job_attempts SET status=$4,finished_at=$5,error_code=$6,error_summary=$7 WHERE workspace_id=$1 AND job_id=$2 AND id=$3 AND status IN ('leased','running')`,[job.workspace_id,job.id,attemptRow.id,attemptStatus,time,code,code ? P.ERRORS[code]:null]);
    const available = status === 'queued' ? new Date(time.getTime()+P.retrySeconds(job.attempt_count,random)*1000) : job.available_at;
    const updated = (await client.query(`UPDATE public.jobs SET status=$3,leased_by=NULL,leased_until=NULL,
      updated_at=$4,available_at=$5,last_error_code=$6,last_error_summary=$7,result_summary=$8,
      completed_at=CASE WHEN $3='completed' THEN $4::timestamptz ELSE NULL END,
      cancelled_at=CASE WHEN $3='cancelled' THEN $4::timestamptz ELSE NULL END
      WHERE workspace_id=$1 AND id=$2 RETURNING *`,[job.workspace_id,job.id,status,time,available,code,code ? P.ERRORS[code]:null,result])).rows[0];
    const fields={jobId:job.id,attemptId:attemptRow?.id,deviceId:attemptRow?.device_id,status,errorCode:code,updatedAt:updated.updated_at};
    emit(status === 'queued' ? 'retry scheduled':`job ${status}`,fields);
    return updated;
  }
  async function finishFailure(client,job,a,code,time,emit,transient=false) {
    const effects = (await client.query("SELECT status FROM public.job_effects WHERE workspace_id=$1 AND job_id=$2 AND status<>'acknowledged' FOR UPDATE",[job.workspace_id,job.id])).rows;
    const uncertain=effects.length>0;
    if (uncertain) {
      code='EFFECT_OUTCOME_UNKNOWN';
      await client.query("UPDATE public.job_effects SET status='uncertain',updated_at=$3 WHERE workspace_id=$1 AND job_id=$2 AND status='started'",[job.workspace_id,job.id,time]);
    }
    let status=transient && !uncertain && job.attempt_count<job.max_attempts ? 'queued':'failed';
    if (job.cancel_requested_at && !uncertain) {status='cancelled';code='CANCELLED';}
    // Even a failed/expired attempt consumes a normal dispatch interval.
    const config=(await client.query('SELECT followup_gap_seconds,min_interval_minutes FROM public.automation_settings WHERE workspace_id=$1',[job.workspace_id])).rows[0];
    const cooldown=job.type==='search' ? 1 : job.type==='followup' ? Math.max(1,config?.followup_gap_seconds || 30) : Math.max(1,config?.min_interval_minutes || 10)*60;
    await client.query(`UPDATE public.workspace_job_runtime SET next_dispatch_at=GREATEST(next_dispatch_at,$3),updated_at=$4 WHERE workspace_id=$1 AND lane=$2`,[job.workspace_id,job.lane,new Date(time.getTime()+cooldown*1000),time]);
    return terminal(client,job,a,status,code,null,time,emit);
  }
  async function applyBusinessResult(client,job,time) {
    if (job.type==='search') return true;
    // This Cloud-only foundation is called under the locked job. A terminal
    // receipt and these writes commit together, so completion replay cannot
    // increment usage, score or followup count twice.
    const p=job.payload;
    const config=(await client.query('SELECT * FROM public.automation_settings WHERE workspace_id=$1',[job.workspace_id])).rows[0];
    const sender=(await client.query('SELECT * FROM public.sending_numbers WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[job.workspace_id,p.sendingNumberId])).rows[0];
    if (!sender || !config) return false;
    if (job.type==='send_message') {
      await client.query(`UPDATE public.leads SET status='contacted',pipeline_stage='contacted',last_contact=$3::timestamptz,
        assigned_number=$4,followup_count=0,next_followup_at=$3::timestamptz+interval '24 hours'
        WHERE workspace_id=$1 AND id=$2 AND status='pending' AND is_archived=false AND last_reply_at IS NULL`,[job.workspace_id,p.leadId,time,sender.phone_number]);
    } else {
      const delay=p.followupCount===1 ? Number(config.followup_delay_hours_1 || 24):Number(config.followup_delay_hours_2 || 72);
      const next=p.followupCount<Number(config.followup_max_count) ? new Date(time.getTime()+delay*3600000):null;
      await client.query(`UPDATE public.leads SET followup_count=$3,last_followup_at=$4,last_contact=$4,next_followup_at=$5
        WHERE workspace_id=$1 AND id=$2 AND status='contacted' AND is_archived=false AND last_reply_at IS NULL AND COALESCE(followup_count,0)=$6`,[job.workspace_id,p.leadId,p.followupCount,time,next,p.followupCount-1]);
    }
    await client.query('UPDATE public.sending_numbers SET sent_today=sent_today+1 WHERE workspace_id=$1 AND id=$2',[job.workspace_id,p.sendingNumberId]);
    await client.query(`INSERT INTO public.lead_events(workspace_id,lead_id,event_type,source,metadata)
      SELECT workspace_id,id,$3,'jobs',$4::jsonb FROM public.leads WHERE workspace_id=$1 AND id=$2`,[job.workspace_id,p.leadId,job.type==='followup'?'followup_sent':'message_sent',JSON.stringify({job_id:job.id})]);
    return true;
  }
  async function advanceDispatch(client,job,time) {
    const config=(await client.query('SELECT followup_gap_seconds,min_interval_minutes,max_interval_minutes FROM public.automation_settings WHERE workspace_id=$1',[job.workspace_id])).rows[0];
    const min=Math.max(1,config?.min_interval_minutes || 10),max=Math.max(min,config?.max_interval_minutes || min);
    const seconds=job.type==='search' ? 1 : job.type==='followup' ? Math.max(1,config?.followup_gap_seconds || 30) : (min+Math.floor(random()*(max-min+1)))*60;
    await client.query('UPDATE public.workspace_job_runtime SET next_dispatch_at=GREATEST(next_dispatch_at,$3),updated_at=$4 WHERE workspace_id=$1 AND lane=$2',[job.workspace_id,job.lane,new Date(time.getTime()+seconds*1000),time]);
  }
  async function create(ctx,input) {
    P.exact(input,['type','payload','idempotencyKey','scheduledAt']);
    const key=P.text(input.idempotencyKey), scheduledAt=input.scheduledAt ? P.instant(input.scheduledAt):null;
    const spec=P.definition(input.type,input.payload,key);
    const hash=P.fingerprint({type:input.type,payload:input.payload,scheduledAt});
    return transaction(ctx.workspaceId,async(client,w,emit)=>{
      if (spec.lane==='automation') {
        for (const [table,id] of [['leads',input.payload.leadId],['sending_numbers',input.payload.sendingNumberId]]) {
          if (!(await client.query(`SELECT id FROM public.${table} WHERE workspace_id=$1 AND id=$2`,[ctx.workspaceId,id])).rowCount) P.reject('NOT_FOUND',404);
        }
      }
      const time=await now(client), date=scheduledAt ? new Date(scheduledAt):time;
      const row=(await client.query(`INSERT INTO public.jobs(id,workspace_id,type,lane,payload,scheduled_at,available_at,idempotency_key,input_fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8) ON CONFLICT(workspace_id,idempotency_key) DO NOTHING RETURNING *`,[randomUUID(),ctx.workspaceId,input.type,spec.lane,input.payload,date,key,hash])).rows[0];
      const job=row || (await client.query('SELECT * FROM public.jobs WHERE workspace_id=$1 AND idempotency_key=$2',[ctx.workspaceId,key])).rows[0];
      if (job.input_fingerprint!==hash) P.reject('IDEMPOTENCY_CONFLICT');
      if (row) emit('job queued',{jobId:job.id,status:job.status,updatedAt:job.updated_at});
      return job;
    });
  }
  async function claim(ctx,input={}) {
    P.exact(input,['lane']);
    if (!['automation','search'].includes(input.lane)) P.reject();
    return transaction(ctx.workspaceId,async(client,w,emit)=>{
      await authorizeConsumer(client,ctx);
      const control=await lane(client,ctx.workspaceId,input.lane), time=await now(client);
      if (control.is_paused || new Date(control.next_dispatch_at)>time) return null;
      if ((await client.query("SELECT 1 FROM public.jobs WHERE workspace_id=$1 AND lane=$2 AND status IN ('leased','running')",[ctx.workspaceId,input.lane])).rowCount) return null;
      const candidates=(await client.query(`SELECT * FROM public.jobs WHERE workspace_id=$1 AND lane=$2 AND status='queued' AND available_at<=clock_timestamp() AND attempt_count<max_attempts
        ORDER BY scheduled_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 25`,[ctx.workspaceId,input.lane])).rows;
      let job,policy;
      for(const candidate of candidates) {
        const gate=await eligible(client,candidate,w,time);
        if(gate.allowed) {job=candidate;policy=gate;break;}
        if(gate.obsolete) await terminal(client,candidate,null,'cancelled','OBSOLETE',null,time,emit);
        else await client.query("UPDATE public.jobs SET available_at=GREATEST(available_at,$3::timestamptz+interval '30 seconds'),updated_at=$3 WHERE workspace_id=$1 AND id=$2",[ctx.workspaceId,candidate.id,time]);
      }
      if(!job)return null;
      const id=randomUUID(), until=new Date(time.getTime()+P.LEASE_SECONDS*1000);
      const updated=(await client.query(`UPDATE public.jobs SET status='leased',attempt_count=attempt_count+1,leased_by=$3,current_attempt_id=$4,leased_until=$5,updated_at=$6 WHERE workspace_id=$1 AND id=$2 AND status='queued' RETURNING *`,[ctx.workspaceId,job.id,ctx.deviceId,id,until,time])).rows[0];
      await client.query(`INSERT INTO public.job_attempts(id,workspace_id,job_id,device_id,consumer_session_id,attempt_number,status,leased_at,leased_until) VALUES($1,$2,$3,$4,$5,$6,'leased',$7,$8)`,[id,ctx.workspaceId,job.id,ctx.deviceId,ctx.sessionId,updated.attempt_count,time,until]);
      await client.query('UPDATE public.workspace_job_runtime SET next_dispatch_at=$3,updated_at=$4 WHERE workspace_id=$1 AND lane=$2',[ctx.workspaceId,job.lane,new Date(time.getTime()+policy.cooldownSeconds*1000),time]);
      emit('job claimed',{jobId:job.id,attemptId:id,deviceId:ctx.deviceId,status:'leased',updatedAt:updated.updated_at});
      return updated;
    });
  }
  async function mutate(ctx,id,action,input={}) {
    if(!['start','renew','complete','fail'].includes(action))P.reject();
    P.exact(input,['attemptId',...(action==='complete' ? ['result']:action==='fail' ? ['code']:[])]);
    P.uuid(input.attemptId);
    const summary=action==='complete' ? P.resultSummary(input.result):null;
    if (action==='fail' && !['TRANSIENT','DEFINITIVE'].includes(input.code)) P.reject();
    return transaction(ctx.workspaceId,async(client,w,emit)=>{
      await authorizeConsumer(client,ctx,{allowPaused:action!=='start'});
      const job=await lockedJob(client,ctx,id);
      // A completion receipt can be replayed by its original authenticated owner,
      // even after lease expiry. It never authorizes a fresh effect.
      if (action==='complete' && job.status==='completed' && job.current_attempt_id===input.attemptId) {
        const a=(await client.query('SELECT * FROM public.job_attempts WHERE workspace_id=$1 AND job_id=$2 AND id=$3',[ctx.workspaceId,id,input.attemptId])).rows[0];
        if (a?.device_id!==ctx.deviceId || a.consumer_session_id!==ctx.sessionId || job.completion_fingerprint!==P.fingerprint(summary)) P.reject('STALE_LEASE');
        return job;
      }
      const {row:a,time}=await attempt(client,ctx,job,input.attemptId,action==='start'||action==='fail');
      if (action==='start') {
        if (job.status==='running') return job;
        const gate=await eligible(client,job,w,time);
        if (job.cancel_requested_at || gate.obsolete) return terminal(client,job,a,'cancelled',job.cancel_requested_at?'CANCELLED':'OBSOLETE',null,time,emit);
        if(!gate.allowed)return finishFailure(client,job,a,'TRANSIENT',time,emit,true);
        await client.query("UPDATE public.job_attempts SET status='running',started_at=$4 WHERE workspace_id=$1 AND job_id=$2 AND id=$3",[ctx.workspaceId,id,a.id,time]);
        const updated=(await client.query("UPDATE public.jobs SET status='running',updated_at=$3 WHERE workspace_id=$1 AND id=$2 RETURNING *",[ctx.workspaceId,id,time])).rows[0];
        emit('job started',{jobId:id,attemptId:a.id,deviceId:ctx.deviceId,status:'running',updatedAt:updated.updated_at}); return updated;
      }
      if (action==='renew') {
        const until=new Date(time.getTime()+P.LEASE_SECONDS*1000);
        await client.query('UPDATE public.job_attempts SET leased_until=$4 WHERE workspace_id=$1 AND job_id=$2 AND id=$3',[ctx.workspaceId,id,a.id,until]);
        return (await client.query('UPDATE public.jobs SET leased_until=$3,updated_at=$4 WHERE workspace_id=$1 AND id=$2 RETURNING *',[ctx.workspaceId,id,until,time])).rows[0];
      }
      if (action==='fail') return finishFailure(client,job,a,input.code,time,emit,input.code==='TRANSIENT');
      const spec=P.definition(job.type,job.payload,job.idempotency_key);
      const effects=(await client.query('SELECT * FROM public.job_effects WHERE workspace_id=$1 AND job_id=$2 ORDER BY ordinal FOR UPDATE',[ctx.workspaceId,id])).rows;
      if (effects.some(e=>e.status!=='acknowledged')) return finishFailure(client,job,a,'EFFECT_OUTCOME_UNKNOWN',time,emit);
      if (effects.length!==spec.effectCount) P.reject('EFFECTS_NOT_ACKNOWLEDGED');
      if(!await applyBusinessResult(client,job,time))return finishFailure(client,job,a,'RESULT_RECONCILIATION_REQUIRED',time,emit);
      await advanceDispatch(client,job,time);
      await client.query('UPDATE public.jobs SET completion_fingerprint=$3 WHERE workspace_id=$1 AND id=$2',[ctx.workspaceId,id,P.fingerprint(summary)]);
      return terminal(client,job,a,'completed',null,summary,time,emit);
    });
  }
  async function effect(ctx,id,ordinal,action,input) {
    if(!['begin','ack'].includes(action))P.reject();
    P.integer(ordinal,0,7); P.exact(input,['attemptId',...(action==='ack' ? ['result']:[])]); P.uuid(input.attemptId);
    const summary=action==='ack' ? P.resultSummary(input.result):null;
    if(action==='ack') {P.exact(summary,['outcome']);if(summary.outcome!=='applied')P.reject();}
    return transaction(ctx.workspaceId,async(client,w,emit)=>{
      await authorizeConsumer(client,ctx,{allowPaused:action==='ack'});
      const job=await lockedJob(client,ctx,id), {row:a,time}=await attempt(client,ctx,job,input.attemptId);
      const spec=P.definition(job.type,job.payload,job.idempotency_key);
      if (ordinal>=spec.effectCount) P.reject();
      const key=`${spec.effectBase}:${ordinal}`, hash=P.fingerprint({payload:job.payload,ordinal});
      const existing=(await client.query('SELECT * FROM public.job_effects WHERE workspace_id=$1 AND effect_key=$2 FOR UPDATE',[ctx.workspaceId,key])).rows[0];
      if (existing) {
        if (existing.input_fingerprint!==hash || existing.job_id!==id) P.reject('EFFECT_CONFLICT');
        if (action==='begin') return {execute:false,status:existing.status,result:existing.result_summary};
        if (existing.status==='acknowledged') {
          if (P.fingerprint(existing.result_summary)!==P.fingerprint(summary)) P.reject('EFFECT_CONFLICT');
          return {execute:false,status:'acknowledged',result:existing.result_summary};
        }
        if (existing.status!=='started' || existing.attempt_id!==a.id) P.reject('EFFECT_OUTCOME_UNKNOWN');
        await client.query("UPDATE public.job_effects SET status='acknowledged',acknowledged_at=$3,updated_at=$3,result_summary=$4 WHERE workspace_id=$1 AND effect_key=$2",[ctx.workspaceId,key,time,summary]);
        return {execute:false,status:'acknowledged',result:summary};
      }
      if (action!=='begin') P.reject('EFFECT_NOT_STARTED');
      if (job.cancel_requested_at) P.reject('CANCEL_REQUESTED');
      if (!(await eligible(client,job,w,time)).allowed) P.reject('JOB_NOT_ELIGIBLE');
      if (ordinal>0 && !(await client.query("SELECT 1 FROM public.job_effects WHERE workspace_id=$1 AND job_id=$2 AND ordinal=$3 AND status='acknowledged'",[ctx.workspaceId,id,ordinal-1])).rowCount) P.reject('EFFECT_ORDER');
      await client.query(`INSERT INTO public.job_effects(id,workspace_id,job_id,attempt_id,effect_key,ordinal,input_fingerprint,status) VALUES($1,$2,$3,$4,$5,$6,$7,'started')`,[randomUUID(),ctx.workspaceId,id,a.id,key,ordinal,hash]);
      emit('effect started',{jobId:id,attemptId:a.id,deviceId:ctx.deviceId});
      return {execute:true,status:'started'};
    });
  }
  async function cancel(ctx,id) {
    return transaction(ctx.workspaceId,async(client,_w,emit)=>{
      const job=await lockedJob(client,ctx,id), time=await now(client);
      if (P.TERMINAL.has(job.status)) return job;
      const a=job.current_attempt_id ? (await client.query('SELECT * FROM public.job_attempts WHERE workspace_id=$1 AND job_id=$2 AND id=$3 FOR UPDATE',[ctx.workspaceId,id,job.current_attempt_id])).rows[0]:null;
      if (job.status==='running') return (await client.query('UPDATE public.jobs SET cancel_requested_at=COALESCE(cancel_requested_at,$3),updated_at=$3 WHERE workspace_id=$1 AND id=$2 RETURNING *',[ctx.workspaceId,id,time])).rows[0];
      return terminal(client,job,a,'cancelled','CANCELLED',null,time,emit);
    });
  }
  async function recover() {
    const candidates=(await db.query(`SELECT workspace_id,id FROM public.jobs j WHERE status IN ('leased','running') AND (leased_until<=clock_timestamp() OR EXISTS(SELECT 1 FROM public.job_attempts a WHERE a.id=j.current_attempt_id AND a.started_at<=clock_timestamp()-CASE WHEN j.type='search' THEN interval '30 minutes' ELSE interval '5 minutes' END)) ORDER BY leased_until LIMIT 100`)).rows;
    for (const item of candidates) {
      try {
        await transaction(item.workspace_id,async(client,_w,emit)=>{
          const job=await lockedJob(client,{workspaceId:item.workspace_id},item.id), time=await now(client);
          if (!['leased','running'].includes(job.status)) return;
          const a=(await client.query('SELECT * FROM public.job_attempts WHERE workspace_id=$1 AND job_id=$2 AND id=$3 FOR UPDATE',[job.workspace_id,job.id,job.current_attempt_id])).rows[0];
          const timedOut=a.started_at && time-new Date(a.started_at)>=P.definition(job.type,job.payload,job.idempotency_key).timeoutSeconds*1000;
          if (new Date(job.leased_until)>time && !timedOut) return;
          emit('lease expired',{jobId:job.id,attemptId:a.id,deviceId:a.device_id});
          const spec=P.definition(job.type,job.payload,job.idempotency_key);
          const receipts=(await client.query("SELECT status FROM public.job_effects WHERE workspace_id=$1 AND job_id=$2 FOR UPDATE",[job.workspace_id,job.id])).rows;
          if (spec.effectCount>0 && receipts.length===spec.effectCount && receipts.every(e=>e.status==='acknowledged')) {
            const result={outcome:'applied'};
            if(!await applyBusinessResult(client,job,time))return finishFailure(client,job,a,'RESULT_RECONCILIATION_REQUIRED',time,emit);
            await advanceDispatch(client,job,time);
            await client.query('UPDATE public.jobs SET completion_fingerprint=$3 WHERE workspace_id=$1 AND id=$2',[job.workspace_id,job.id,P.fingerprint(result)]);
            await terminal(client,job,a,'completed',null,result,time,emit);
          } else await finishFailure(client,job,a,timedOut?'EXECUTION_TIMEOUT':'LEASE_EXPIRED',time,emit,true);
        },true);
      } catch(error) { if (error.code!=='WORKSPACE_NOT_OPERATIONAL') throw error; }
    }
    return candidates.length;
  }
  async function setPaused(ctx,name,paused) {
    if (!['automation','search'].includes(name) || typeof paused!=='boolean') P.reject();
    return transaction(ctx.workspaceId,async(client)=>{
      await lane(client,ctx.workspaceId,name);
      return (await client.query('UPDATE public.workspace_job_runtime SET is_paused=$3,next_dispatch_at=GREATEST(next_dispatch_at,clock_timestamp()),updated_at=clock_timestamp() WHERE workspace_id=$1 AND lane=$2 RETURNING *',[ctx.workspaceId,name,paused])).rows[0];
    });
  }
  async function read(ctx,id,attempts=false) {
    P.uuid(id);
    return transaction(ctx.workspaceId,async(client)=>{
      const job=(await client.query('SELECT * FROM public.jobs WHERE workspace_id=$1 AND id=$2',[ctx.workspaceId,id])).rows[0];
      if (!job) P.reject('NOT_FOUND',404);
      return attempts ? (await client.query('SELECT id,device_id,attempt_number,status,leased_at,leased_until,started_at,finished_at,error_code,error_summary FROM public.job_attempts WHERE workspace_id=$1 AND job_id=$2 ORDER BY attempt_number',[ctx.workspaceId,id])).rows : job;
    });
  }
  async function list(ctx) { return transaction(ctx.workspaceId,async(client)=>(await client.query('SELECT * FROM public.jobs WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[ctx.workspaceId])).rows); }
  return Object.freeze({create,claim,mutate,effect,cancel,recover,setPaused,read,list});
}
function jobSummary(job) {
  return Object.fromEntries(['id','type','status','scheduled_at','available_at','attempt_count','max_attempts','created_at','updated_at','completed_at','cancelled_at','cancel_requested_at','last_error_code','last_error_summary','result_summary'].map(key=>[key,job[key]]));
}
module.exports={createJobService,jobSummary};
