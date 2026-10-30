require('../helpers/safeTestEnvironment');
const test=require('node:test');
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const {startLocalPostgres}=require('../helpers/localPostgres');
const {createAuthCryptoService}=require('../../src/services/authCryptoService');
const {createAuthService}=require('../../src/services/authService');
const {createAuthSessionService,REFRESH_COLLISION_WINDOW_MS}=require('../../src/services/authSessionService');
const {createAccountPasswordService}=require('../../src/services/accountPasswordService');

test('Auth security corrections on disposable PostgreSQL 17+',async(t)=>{
  const local=await startLocalPostgres(),db=new Pool(local.config);
  t.after(async()=>{await db.end();await local.stop();});
  const config={otpHmacSecret:'h'.repeat(32),devEmailBypassEnabled:false,otpExpiresInMinutes:10,otpMaxAttempts:5,resendCooldownSeconds:60,maxChallengesPerHour:5,verificationRetryWindowMinutes:5,refreshTokenTtlSeconds:86400};
  const cryptoService=createAuthCryptoService(config);let code=100000,issued=0;
  const emails=[];
  const auth=createAuthService({db,config,cryptoService:{...cryptoService,generateOtp:()=>String(++code)},emailService:{sendVerificationEmail:async value=>emails.push(value)},logger:{error(){},warn(){}}});
  const sessions=createAuthSessionService({db,config,cryptoService,accessTokenService:{issue:()=>`fixture-access-${++issued}`},logger:{warn(){}}});
  const register=(email,password)=>auth.register({name:'Fixture',email,password,termsVersion:'v1',privacyPolicyVersion:'v1'});
  const cooldown=email=>db.query(`UPDATE email_verification_codes SET created_at=created_at-interval '61 seconds',sent_at=sent_at-interval '61 seconds'
    WHERE user_id=(SELECT id FROM users WHERE email=$1)`,[email]);
  const email='victim@example.test';
  await t.test('replaced password, stale OTP/proof and resend keep credential ownership',async()=>{
    const first=await register(email,'attacker password A'),oldCode=emails.at(-1).code;
    const victim=await register(email,'victim password B');assert.equal(emails.length,1);
    await cooldown(email);
    await auth.resend({email,verificationAttempt:first.verificationAttempt});assert.equal(emails.length,1);
    await auth.resend({email,verificationAttempt:victim.verificationAttempt});assert.equal(emails.length,2);
    await assert.rejects(auth.verify({email,code:oldCode,verificationAttempt:victim.verificationAttempt}),{code:'INVALID_OR_EXPIRED_CODE'});
    await assert.rejects(auth.verify({email,code:emails.at(-1).code,verificationAttempt:first.verificationAttempt}),{code:'INVALID_OR_EXPIRED_CODE'});
    await auth.verify({email,code:emails.at(-1).code,verificationAttempt:victim.verificationAttempt});
    await assert.rejects(sessions.login({email,password:'attacker password A'}),{code:'INVALID_CREDENTIALS'});
    assert.ok((await sessions.login({email,password:'victim password B'})).accessToken);
    await register(email,'attacker replacement password');
    assert.ok((await sessions.login({email,password:'victim password B'})).accessToken);
  });
  await t.test('real concurrent rotation leaves one successor; stale replay still revokes',async()=>{
    const login=await sessions.login({email,password:'victim password B'});
    const results=await Promise.allSettled([sessions.refresh(login.refreshToken),sessions.refresh(login.refreshToken)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.code,'REFRESH_COLLISION');
    const original=(await db.query('SELECT * FROM refresh_tokens WHERE token_digest=$1',[cryptoService.createRefreshTokenDigest(login.refreshToken)])).rows[0];
    assert.equal((await db.query('SELECT count(*)::int AS active FROM refresh_tokens WHERE family_id=$1 AND revoked_at IS NULL',[original.family_id])).rows[0].active,1);
    const before=issued;
    await new Promise(resolve=>setTimeout(resolve,REFRESH_COLLISION_WINDOW_MS+50));
    await assert.rejects(sessions.refresh(login.refreshToken),{code:'INVALID_SESSION'});
    assert.equal(issued,before);
    assert.equal((await db.query('SELECT count(*)::int AS active FROM refresh_tokens WHERE family_id=$1 AND revoked_at IS NULL',[original.family_id])).rows[0].active,0);
  });
  await t.test('password change/auth_version and logout cannot be bypassed by collision grace',async()=>{
    const login=await sessions.login({email,password:'victim password B'});
    await sessions.refresh(login.refreshToken);
    const user=(await db.query('SELECT id FROM users WHERE email=$1',[email])).rows[0];
    await createAccountPasswordService({db,cryptoService}).changePassword({userId:user.id,currentPassword:'victim password B',newPassword:'victim new password C'});
    await assert.rejects(sessions.refresh(login.refreshToken),{code:'INVALID_SESSION'});
    await assert.rejects(sessions.login({email,password:'victim password B'}),{code:'INVALID_CREDENTIALS'});
    const fresh=await sessions.login({email,password:'victim new password C'});
    await Promise.allSettled([sessions.refresh(fresh.refreshToken),sessions.logout(fresh.refreshToken)]);
    await assert.rejects(sessions.refresh(fresh.refreshToken),{code:'INVALID_SESSION'});
  });
});
