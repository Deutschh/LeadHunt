import test from 'node:test';
import assert from 'node:assert/strict';
import {AUTH_COOKIE_LOCK,createAuthCookieCoordinator} from '../src/auth/authCookieCoordinator.js';
import {createAuthHttpClient} from '../src/auth/authHttpClient.js';
import {createAuthSessionController} from '../src/auth/authSessionController.js';

function lockManager() {
  let tail=Promise.resolve();const names=[];
  return {names,request(name,options,operation){
    names.push(name);assert.equal(options.mode,'exclusive');
    const next=tail.then(()=>{if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');return operation();});
    tail=next.catch(()=>{});return next;
  }};
}
const identity={user:{name:'Fixture',email:'user@example.test'},membership:{role:'owner'},workspace:{name:'Fixture',accountStatus:'pending',isActive:true,timezone:'America/Sao_Paulo',releaseChannel:'stable',minProfiles:2,maxProfiles:2}};
const session=accessToken=>({accessToken,tokenType:'Bearer',expiresIn:600});

test('two independent tabs serialize refresh through a shared Web Lock and both authenticate',async()=>{
  const locks=lockManager();let cookie=0,activeCookie=0,collisions=0,calls=0;
  const transport={request:async({url})=>{
    if(url==='/auth/me')return {data:identity};
    assert.equal(url,'/auth/refresh');
    const sent=cookie;calls++;
    if(sent!==activeCookie){collisions++;throw {isAxiosError:true,response:{status:409,data:{code:'REFRESH_COLLISION'}}};}
    activeCookie++;
    // Simulate applying Set-Cookie only when the response arrives, after the
    // server has already rotated. The other tab must still hold off sending.
    await new Promise(resolve=>setTimeout(resolve,10));cookie=activeCookie;
    return {data:session(`access-${cookie}`)};
  }};
  const tabs=[0,1].map(()=>createAuthSessionController({client:createAuthHttpClient({axiosInstance:transport,cookieCoordinator:createAuthCookieCoordinator({locks})})}));
  await Promise.all(tabs.map(tab=>tab.start()));
  assert.equal(calls,2);assert.equal(collisions,0);assert.equal(cookie,2);
  assert.ok(locks.names.every(name=>name===AUTH_COOKIE_LOCK));
  for(const tab of tabs){assert.equal(tab.getSnapshot().status,'authenticated');tab.dispose();}
});

test('login, logout and password reset share the cookie lock; aborted waiter performs no I/O',async()=>{
  const locks=lockManager(),order=[];let finish,started;
  const starting=new Promise(resolve=>{started=resolve;});
  const transport={request:async({url})=>{
    order.push(url);
    if(url==='/auth/refresh'){started();await new Promise(resolve=>{finish=resolve;});}
    return {data:session('fixture')};
  }};
  const a=createAuthHttpClient({axiosInstance:transport,cookieCoordinator:createAuthCookieCoordinator({locks})});
  const b=createAuthHttpClient({axiosInstance:transport,cookieCoordinator:createAuthCookieCoordinator({locks})});
  const refresh=a.refresh();await starting;
  const abort=new AbortController();const stale=b.login({}, {signal:abort.signal});
  const staleResult=assert.rejects(stale,{code:'REQUEST_ABORTED'});abort.abort();
  const logout=b.logout(),login=b.login({}),reset=a.resetPassword({});
  finish();await Promise.all([refresh,staleResult,logout,login,reset]);
  assert.deepEqual(order,['/auth/refresh','/auth/logout','/auth/login','/auth/password/reset']);
});

test('fallback refresh collision retry is bounded, never retries replay 401, and preserves retryable failure',async()=>{
  let calls=0,waits=0;
  const collision={isAxiosError:true,response:{status:409,data:{code:'REFRESH_COLLISION',error:'Concurrent rotation'}}};
  const client=createAuthHttpClient({axiosInstance:{request:async()=>{calls++;if(calls===1)throw collision;return {data:session('new-cookie')};}},refreshRetryWait:async()=>{waits++;}});
  assert.equal((await client.refresh()).accessToken,'new-cookie');assert.equal(calls,2);assert.equal(waits,1);
  calls=0;
  const repeated=createAuthHttpClient({axiosInstance:{request:async()=>{calls++;throw collision;}},refreshRetryWait:async()=>{}});
  await assert.rejects(repeated.refresh(),error=>error.code==='REFRESH_COLLISION' && error.retryable);assert.equal(calls,3);
  calls=0;
  const replay=createAuthHttpClient({axiosInstance:{request:async()=>{calls++;throw {isAxiosError:true,response:{status:401,data:{code:'INVALID_SESSION'}}};}}});
  await assert.rejects(replay.refresh(),{code:'INVALID_SESSION'});assert.equal(calls,1);
});

test('aborting an in-flight refresh cannot release its cookie lock before a newer login',async()=>{
  const locks=lockManager(),order=[];let complete,started;
  const starting=new Promise(resolve=>{started=resolve;});
  const transport={request:async({url,signal})=>{
    assert.equal(signal,undefined);
    order.push(`${url}:start`);
    if(url==='/auth/refresh'){started();await new Promise(resolve=>{complete=resolve;});}
    order.push(`${url}:cookie-applied`);return {data:session('fixture')};
  }};
  const client=createAuthHttpClient({axiosInstance:transport,cookieCoordinator:createAuthCookieCoordinator({locks})});
  const abort=new AbortController();const old=client.refresh({signal:abort.signal});await starting;
  abort.abort();const newer=client.login({email:'new@example.test',password:'fixture'});
  await Promise.resolve();assert.deepEqual(order,['/auth/refresh:start']);
  complete();await Promise.all([old,newer]);
  assert.deepEqual(order,['/auth/refresh:start','/auth/refresh:cookie-applied','/auth/login:start','/auth/login:cookie-applied']);
});
