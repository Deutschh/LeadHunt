// One origin-wide Web Lock covers the complete request/response, including the
// browser applying Set-Cookie. No credentials are shared between tabs.
// https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request
export const AUTH_COOKIE_LOCK='leadhunt-auth-cookie-v1';
let realmTail=Promise.resolve();

export function createAuthCookieCoordinator({locks=globalThis.navigator?.locks}={}) {
  function run(operation,{signal}={}) {
    const guarded=()=>{
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      return operation();
    };
    if(typeof locks?.request==='function')return locks.request(AUTH_COOKIE_LOCK,{mode:'exclusive',...(signal?{signal}:{})},guarded);
    // Same-realm fallback. Cross-tab collisions on browsers without Web Locks
    // are denied (409) by the bounded server protocol, never treated as success.
    const queued=realmTail.then(guarded,guarded);
    realmTail=queued.catch(()=>undefined);
    return queued;
  }
  return Object.freeze({run});
}

export const authCookieCoordinator=createAuthCookieCoordinator();

export function waitForRefreshCookie(milliseconds,signal) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},milliseconds);
    signal?.addEventListener('abort',abort,{once:true});
  });
}
