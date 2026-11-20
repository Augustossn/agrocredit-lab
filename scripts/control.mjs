import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const action=process.argv[2],test=action==='test'||process.argv.includes('--test'),fallback=process.argv.includes('--fallback'),portable=process.argv.includes('--portable');
const local=path.join(root,'.local');fs.mkdirSync(local,{recursive:true});
const registry=path.join(local,'processes.json');let children=fs.existsSync(registry)?JSON.parse(fs.readFileSync(registry,'utf8')):[];
const bin=(name)=>path.join(root,'node_modules',name);
function run(command,args=[],env={}){const result=spawnSync(command,args,{cwd:root,stdio:'inherit',env:{...process.env,...env},windowsHide:true});if(result.status!==0)throw Error(`Comando falhou: ${path.basename(command)} (${result.status})`);}
function node(script,args=[],env={}){run(process.execPath,[script,...args],env);}
function launch(label,command,args,env={}){if(children.some(x=>x.label===label&&alive(x.pid)))return;const fd=fs.openSync(path.join(local,label+'.log'),'a');const child=spawn(command,args,{cwd:root,env:{...process.env,...env},detached:true,stdio:['ignore',fd,fd],windowsHide:true});child.unref();fs.closeSync(fd);children.push({label,pid:child.pid,command:path.basename(command)});fs.writeFileSync(registry,JSON.stringify(children,null,2));console.log(`${label} iniciado (PID ${child.pid})`);}
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
function port(p){return new Promise(resolve=>{const s=net.createConnection({host:'127.0.0.1',port:p});s.on('connect',()=>{s.destroy();resolve(true)});s.on('error',()=>resolve(false));s.setTimeout(1000,()=>{s.destroy();resolve(false)});});}
async function wait(p){for(let i=0;i<100;i++){if(await port(p))return;await new Promise(r=>setTimeout(r,300));}throw Error(`Porta ${p} indisponível; consulte .local/*.log`);}
function envFor(isTest){return isTest?{NODE_ENV:'test',DATABASE_URL:'postgresql://agrolab:local-test-only@127.0.0.1:55433/agrocredit_test?schema=public',S3_ENDPOINT:'http://127.0.0.1:15000',SQS_ENDPOINT:'http://127.0.0.1:19324',AWS_ACCESS_KEY_ID:'agrolab-local',AWS_SECRET_ACCESS_KEY:'agrolab-local-secret',AWS_EC2_METADATA_DISABLED:'true',BUCKET:'agrocredit-test-documents',QUEUE:'agrocredit-test-analysis',PORT:'13000',WEB_PORT:'15173',WEB_ORIGIN:'http://127.0.0.1:15173',DEMO_PASSWORD:'Ficticio!2026'}:{};}
const env=envFor(test),suffix=test?'-test':'';
function pgBin(){if(process.env.PG_BIN)return process.env.PG_BIN;const installed='C:/Program Files/PostgreSQL/17/bin';return fs.existsSync(installed)?installed:'';}
function pg(name){const base=pgBin();return base?path.join(base,name+(process.platform==='win32'?'.exe':'')):name;}
async function infra(){
 if(!portable&&!fallback){
  // Recusa daemon do Docker Desktop. Não inicia nenhum daemon.
  const result=spawnSync('docker',['info','--format','{{.OperatingSystem}}'],{encoding:'utf8',windowsHide:true});
  if(result.status!==0||/docker desktop/i.test(result.stdout))throw Error('Docker Engine independente indisponível. Use --portable --fallback ou siga o README.');
  run('docker',['compose',...(test?['-f','compose.test.yml']:[]),'up','-d']);
 }else{
  if(!fallback)throw Error('Para execução portátil, inicie Moto e ElasticMQ conforme README ou use --fallback explicitamente.');
  const dir=path.join(local,'pg'+suffix),dbName=test?'agrocredit_test':'agrocredit',pgport=test?55433:55432;
  if(!fs.existsSync(path.join(dir,'PG_VERSION'))){
   fs.mkdirSync(dir,{recursive:true});const password=test?'local-test-only':readEnv().POSTGRES_PASSWORD;const pass=path.join(local,'pg-password'+suffix);fs.writeFileSync(pass,password,{mode:0o600});
   try{run(pg('initdb'),['-D',dir,'-U','agrolab',`--pwfile=${pass}`,'--auth=scram-sha-256','--encoding=UTF8','--locale=C']);}finally{fs.unlinkSync(pass);}
  }
  if(!await port(pgport)){launch('postgres'+suffix,pg('postgres'),['-D',dir,'-h','127.0.0.1','-p',String(pgport)]);await wait(pgport);}
  const password=test?'local-test-only':readEnv().POSTGRES_PASSWORD;
  const identity=spawnSync(pg('psql'),['-h','127.0.0.1','-p',String(pgport),'-U','agrolab','-d','postgres','-tAc',"SELECT current_setting('data_directory')"],{env:{...process.env,PGPASSWORD:password},encoding:'utf8',windowsHide:true});
  if(identity.status!==0||path.resolve(identity.stdout.trim()).toLowerCase()!==path.resolve(dir).toLowerCase())throw Error('A porta pertence a outro cluster; nenhuma alteração foi realizada nele.');
  const check=spawnSync(pg('psql'),['-h','127.0.0.1','-p',String(pgport),'-U','agrolab','-d','postgres','-tAc',`SELECT 1 FROM pg_database WHERE datname='${dbName}'`],{env:{...process.env,PGPASSWORD:password},encoding:'utf8',windowsHide:true});
  if(check.status!==0)throw Error('Não foi possível verificar o cluster exclusivo deste projeto');
  if(!check.stdout.trim())run(pg('createdb'),['-h','127.0.0.1','-p',String(pgport),'-U','agrolab',dbName],{PGPASSWORD:password});
  launch('fallback'+suffix,process.env.PYTHON??'python',['scripts/fallback.py','--s3-port',test?'15000':'5000','--sqs-port',test?'19324':'9324','--data','.local/fallback'+suffix]);
 }
 for(const p of [test?55433:55432,test?15000:5000,test?19324:9324])await wait(p);
}
function readEnv(){const data=fs.existsSync('.env')?fs.readFileSync('.env','utf8'):'';return Object.fromEntries(data.split(/\r?\n/).filter(x=>x&&!x.startsWith('#')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];}));}
function setup(){if(!fs.existsSync('.env')){const password=crypto.randomBytes(24).toString('hex');const example=fs.readFileSync('.env.example','utf8').replace('agrolab:local-only@',`agrolab:${password}@`);fs.writeFileSync('.env',example+'\nPOSTGRES_PASSWORD='+password+'\n',{mode:0o600});console.log('Configuração local criada.');}node(bin('prisma/build/index.js'),['generate']);}
function migrate(){node('dist/check.js',[],env);node(bin('prisma/build/index.js'),['migrate','deploy'],env);node('dist/seed.js',[],env);}
async function startApps(){launch('api'+suffix,process.execPath,['dist/main.js'],env);launch('worker'+suffix,process.execPath,['dist/worker.js'],env);launch('web'+suffix,process.execPath,[bin('vite/bin/vite.js'),'--config','web/vite.config.mjs','--configLoader','native'],env);await wait(test?13000:3000);await wait(test?15173:5173);let healthy=false;for(let i=0;i<30;i++){try{const response=await fetch(`http://127.0.0.1:${test?13000:3000}/api/health`,{signal:AbortSignal.timeout(2000)});if(response.ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!healthy)throw Error('Health check não aprovou todos os componentes; consulte .local/*.log');console.log(`Abra http://127.0.0.1:${test?15173:5173}`);}
function stopApps(){const labels=['api','worker','web','fallback'].map(x=>x+suffix);for(const child of children.filter(c=>labels.includes(c.label))){try{process.kill(child.pid,'SIGTERM');console.log(`Encerrado ${child.label}`);}catch{}}children=children.filter(c=>!labels.includes(c.label));fs.writeFileSync(registry,JSON.stringify(children,null,2));}
try{
 switch(action){
  case 'setup':setup();break;
  case 'migrate-only':node('dist/check.js',[],env);node(bin('prisma/build/index.js'),['migrate','deploy'],env);break;
  case 'infra-up':await infra();break;
  case 'start':setup();await infra();node(bin('typescript/bin/tsc'),['-p','tsconfig.json']);migrate();await startApps();break;
  case 'stop':stopApps();break;
  case 'infra-down':{stopApps();const dir=path.join(local,'pg'+suffix);if(fs.existsSync(path.join(dir,'postmaster.pid')))run(pg('pg_ctl'),['-D',dir,'-w','stop','-m','fast']);else if(!portable&&!fallback)run('docker',['compose',...(test?['-f','compose.test.yml']:[]),'down']);break;}
  case 'test':{setup();await infra();node(bin('typescript/bin/tsc'),['-p','tsconfig.json']);migrate();try{node(bin('jest/bin/jest.js'),['--runInBand'],{...env,RUN_INTEGRATION:'1'});await startApps();node(bin('@playwright/test/cli.js'),['test'],env);}finally{stopApps();}break;}
  default:throw Error('Use setup, start, stop, infra-up, infra-down ou test. Opções: --test --portable --fallback.');
 }
}catch(e){console.error(e.message);process.exitCode=1;}
