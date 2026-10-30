import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthSessionController} from '../src/auth/authSessionController.js';
import {AuthHttpError} from '../src/auth/authHttpClient.js';

test('invalid interactive login keeps SessionBoundary form mounted and displays error without navigation',async()=>{
  let rejectLogin, loginStarted;
  const started=new Promise(resolve=>{loginStarted=resolve;});
  const controller=createAuthSessionController({client:{
    refresh:async()=>{throw new AuthHttpError({status:401,code:'INVALID_SESSION'});},
    login:async()=>{loginStarted();return new Promise((_resolve,reject)=>{rejectLogin=reject;});},
  }});
  await controller.start();
  // Model the existing SessionBoundary lifecycle: a bootstrap/unavailable screen
  // unmounts LoginPage, discarding its fields and its in-flight catch handler.
  let mounted=true, message=null, navigations=0;
  const fields={email:'user@example.test',password:'incorrect password'};
  controller.subscribe(()=>{if(['bootstrapping','unavailable'].includes(controller.getSnapshot().status))mounted=false;});
  const submitted=controller.login(fields.email,fields.password).then(()=>navigations++).catch(error=>{if(mounted)message=error.message;});
  await started;
  assert.equal(mounted,true);
  assert.notEqual(controller.getSnapshot().status,'bootstrapping');
  rejectLogin(new AuthHttpError({status:401,code:'INVALID_CREDENTIALS',message:'E-mail ou senha inválidos.'}));
  await submitted;
  assert.equal(message,'E-mail ou senha inválidos.');
  assert.equal(navigations,0);
  assert.equal(fields.email,'user@example.test');
  assert.equal(controller.getSnapshot().status,'anonymous');
  controller.dispose();
});
