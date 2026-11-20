import { Database,ElasticQueue,log } from './infra';
import { Processor } from './processor';
import { configuration } from './safety';
async function main(){
  configuration();const db=new Database(),queue=new ElasticQueue();await db.$connect();await queue.initialize();const processor=new Processor(db,queue);let running=true;
  process.on('SIGINT',()=>{running=false;});process.on('SIGTERM',()=>{running=false;});log('worker.started');
  try{while(running){try{
    await db.heartbeat.upsert({where:{id:'analysis-worker'},create:{id:'analysis-worker'},update:{at:new Date()}});
    await processor.dispatch();for(const message of await queue.receive())await processor.handle(message);
  }catch{log('worker.loop_failed',{code:'DEPENDENCY_OR_PROCESSING_ERROR'});await new Promise(resolve=>setTimeout(resolve,1000));}}}
  finally{await db.$disconnect();}
}
main().catch(()=>{log('worker.fatal',{code:'STARTUP_FAILED'});process.exitCode=1;});
