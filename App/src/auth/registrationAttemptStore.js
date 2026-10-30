// Volatile, per-AuthProvider state. Never put this proof (or a password) in a
// URL, browser history, web storage, logs or the public Auth snapshot.
export function createRegistrationAttemptStore() {
  let pending=null;
  function remember(email,proof) {
    if(typeof email!=='string' || typeof proof!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(proof))throw new TypeError('Invalid registration attempt');
    pending={email:email.trim().toLowerCase(),proof};
  }
  function read(email) {return pending?.email===email?.trim().toLowerCase() ? pending.proof:null;}
  function clear(email,proof) {if(pending?.email===email?.trim().toLowerCase() && pending.proof===proof)pending=null;}
  return Object.freeze({remember,read,clear});
}
