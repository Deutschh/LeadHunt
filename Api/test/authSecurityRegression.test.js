const test = require('node:test');
const assert = require('node:assert/strict');
const {createAuthCryptoService} = require('../src/services/authCryptoService');
const {createAuthService} = require('../src/services/authService');
const {createAuthSessionService} = require('../src/services/authSessionService');
const {createFakeAuthDb} = require('./helpers/fakeAuthDb');

function fixture() {
  const db = createFakeAuthDb();
  const config = {otpHmacSecret:'h'.repeat(32),devEmailBypassEnabled:false,otpExpiresInMinutes:10,otpMaxAttempts:5,resendCooldownSeconds:60,maxChallengesPerHour:5,verificationRetryWindowMinutes:5,refreshTokenTtlSeconds:86400};
  const cryptoService = createAuthCryptoService(config);
  let nextCode = 100000;
  const emails = [];
  const auth = createAuthService({db,config,cryptoService:{...cryptoService,generateOtp:()=>String(++nextCode)},emailService:{sendVerificationEmail:async value=>emails.push(value)},logger:{error(){},warn(){}}});
  const sessions = createAuthSessionService({db,config,cryptoService,accessTokenService:{issue:()=> 'fixture-access'},clock:()=>new Date(db.state.now),logger:{warn(){}}});
  const register = password => auth.register({name:'Fixture',email:'victim@example.test',password,termsVersion:'v1',privacyPolicyVersion:'v1'});
  const advance = ms => {db.state.now = new Date(db.state.now.getTime()+ms);};
  return {db,auth,sessions,register,emails,advance};
}
test('regression: victim OTP verifies password B, never pre-registered password A', async()=>{
  const f=fixture();
  await f.register('attacker password A');f.advance(61000);
  const victim=await f.register('victim password B');
  await f.auth.verify({email:'victim@example.test',code:f.emails.at(-1).code,verificationAttempt:victim?.verificationAttempt});
  await assert.rejects(f.sessions.login({email:'victim@example.test',password:'attacker password A'}),{code:'INVALID_CREDENTIALS'});
  assert.ok((await f.sessions.login({email:'victim@example.test',password:'victim password B'})).accessToken);
});
test('regression: OTP from a later registration cannot validate an earlier browser attempt',async()=>{
  const f=fixture();
  const victim=await f.register('victim password B');f.advance(61000);
  await f.register('attacker password C');
  await assert.rejects(f.auth.verify({email:'victim@example.test',code:f.emails.at(-1).code,verificationAttempt:victim?.verificationAttempt}),{code:'INVALID_OR_EXPIRED_CODE'});
  assert.equal(f.db.state.users[0].email_verified_at,null);
});
test('regression: simultaneous refresh does not revoke the valid successor',async()=>{
  const f=fixture(), attempt=await f.register('victim password B');
  await f.auth.verify({email:'victim@example.test',code:f.emails.at(-1).code,verificationAttempt:attempt?.verificationAttempt});
  const login=await f.sessions.login({email:'victim@example.test',password:'victim password B'});
  const results=await Promise.allSettled([f.sessions.refresh(login.refreshToken),f.sessions.refresh(login.refreshToken)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'REFRESH_COLLISION');
  assert.equal(f.db.state.refreshTokens.filter(t=>t.revoked_at===null).length,1);
});

test('replacement during cooldown invalidates old OTP and stale resend without bypassing email limits',async()=>{
  const f=fixture();const attacker=await f.register('attacker password A'),oldCode=f.emails.at(-1).code;
  const victim=await f.register('victim password B');assert.notEqual(victim.verificationAttempt,attacker.verificationAttempt);
  assert.equal(f.emails.length,1);
  await assert.rejects(f.auth.verify({email:'victim@example.test',code:oldCode,verificationAttempt:victim.verificationAttempt}),{code:'INVALID_OR_EXPIRED_CODE'});
  f.advance(61000);
  await f.auth.resend({email:'victim@example.test',verificationAttempt:attacker.verificationAttempt});assert.equal(f.emails.length,1);
  await f.auth.resend({email:'victim@example.test',verificationAttempt:victim.verificationAttempt});assert.equal(f.emails.length,2);
  await assert.rejects(f.auth.verify({email:'victim@example.test',code:oldCode,verificationAttempt:victim.verificationAttempt}),{code:'INVALID_OR_EXPIRED_CODE'});
  await f.auth.verify({email:'victim@example.test',code:f.emails.at(-1).code,verificationAttempt:victim.verificationAttempt});
  const verifiedHash=f.db.state.users[0].password_hash;
  const noop=await f.register('attacker password C');assert.match(noop.verificationAttempt,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(f.db.state.users[0].password_hash,verifiedHash);
  assert.ok((await f.sessions.login({email:'victim@example.test',password:'victim password B'})).accessToken);
});
