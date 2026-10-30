// Disposable PostgreSQL only. No dotenv, DATABASE_URL or existing instance.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
async function startLocalPostgres() {
  const bin = process.env.LEADHUNT_TEST_PG_BIN || (process.platform==='win32' ? 'C:\\Program Files\\PostgreSQL\\17\\bin' : '/usr/lib/postgresql/17/bin');
  const exe = (name) => path.join(bin,name+(process.platform==='win32' ? '.exe':''));
  if (!fs.existsSync(exe('initdb'))) throw new Error('BLOCKED: PostgreSQL 17+ local binaries unavailable; real tests have NOT passed. Set LEADHUNT_TEST_PG_BIN.');
  const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','Path','TEMP','TMP','HOME','USERPROFILE','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  // A daemon may inherit pipe handles on Windows even after pg_ctl exits.
  const run=(name,args)=>execFileSync(exe(name),args,{env,encoding:'utf8',windowsHide:true,stdio:name==='pg_ctl' ? 'ignore':['ignore','pipe','pipe'],timeout:120000});
  const major=Number(/PostgreSQL\)\s+(\d+)/.exec(run('postgres',['--version']))?.[1]);
  if (!Number.isInteger(major) || major<17) throw new Error('BLOCKED: PostgreSQL 17+ required.');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'leadhunt-stage7-'));
  const data=path.join(root,'data');
  const server=net.createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  let started=false;
  async function stop() {
    if (started) {run('pg_ctl',['-D',data,'-m','fast','-w','stop']);started=false;}
    const resolved=path.resolve(root), parent=path.resolve(os.tmpdir());
    if (path.dirname(resolved)!==parent || !path.basename(resolved).startsWith('leadhunt-stage7-')) throw new Error('Unsafe disposable cluster cleanup path');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
  try {
    run('initdb',['-D',data,'-U','stage7_test','-A','trust','--encoding=UTF8','--no-locale']);
    run('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -F -c max_connections=40`,'-w','start']);started=true;
    run('createdb',['-h','127.0.0.1','-p',String(port),'-U','stage7_test','leadhunt_stage7_test']);
    const sqlFile=(file)=>run('psql',['-X','-h','127.0.0.1','-p',String(port),'-U','stage7_test','-d','leadhunt_stage7_test','-v','ON_ERROR_STOP=1','-f',file]);
    const api=path.resolve(__dirname,'../..');
    sqlFile(path.join(api,'src/database/baseline/LeadHunt_schema_pre_multiuser.sql'));
    for (const file of ['001_foundation_multiuser.sql','002_workspace_unique_constraints.sql','003_client_briefing_public_token.sql','004_auth_foundation.sql','005_refresh_token_auth_version.sql','006_admin_activation_audit_foundation.sql','007_jobs_core_foundation.sql','008_distributed_runtime_foundation.sql']) sqlFile(path.join(api,'src/database/migrations',file));
    return {config:{host:'127.0.0.1',port,user:'stage7_test',database:'leadhunt_stage7_test',ssl:false},sqlFile,stop};
  } catch(error) {await stop(); throw new Error(`Disposable PostgreSQL initialization failed: ${error.message}`,{cause:error});}
}
module.exports={startLocalPostgres};
