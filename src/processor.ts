import { Database,QueuePort,QueueMessage,log } from './infra';
import { recommend,transition } from './domain';
import { IsUUID,isUUID } from 'class-validator';
export type Envelope={eventId:string;requestId:string;correlationId:string};
export function envelope(body:string):Envelope {
  const p=JSON.parse(body);if(!p||!['eventId','requestId','correlationId'].every(k=>typeof p[k]==='string'&&isUUID(p[k]))||Object.keys(p).length!==3)throw new Error('INVALID_ENVELOPE');return p;
}
export class Processor {
  constructor(private db:Database,private queue:QueuePort,private fault?:()=>void){}
  async dispatch(){
    const pending=await this.db.analysisEvent.findMany({where:{dispatchedAt:null,processedAt:null,deadAt:null},orderBy:{createdAt:'asc'},take:20});
    for(const event of pending){await this.queue.send({eventId:event.id,requestId:event.requestId,correlationId:event.correlationId});await this.db.analysisEvent.update({where:{id:event.id},data:{dispatchedAt:new Date()}});}
  }
  async result(p:Envelope){
    return this.db.$transaction(async tx=>{
      // Mesma ordem dos locks usada pelo reprocessamento e pela decisão humana.
      await tx.$queryRaw`SELECT id FROM "CreditRequest" WHERE id=${p.requestId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "AnalysisEvent" WHERE id=${p.eventId} FOR UPDATE`;
      const event=await tx.analysisEvent.findUnique({where:{id:p.eventId}});
      if(!event||event.requestId!==p.requestId||event.correlationId!==p.correlationId)throw new Error('EVENT_MISMATCH');
      if(event.processedAt)return 'DUPLICATE';
      if(event.deadAt||event.attempts>=3)return 'DEAD';
      const r=await tx.creditRequest.findUniqueOrThrow({where:{id:p.requestId}});
      if(r.status==='SUBMITTED')transition(r.status,'ANALYZING');else if(r.status!=='ANALYZING')throw new Error('INVALID_REQUEST_STATUS');
      this.fault?.();
      const recommendation=recommend(r);
      await tx.creditRequest.update({where:{id:r.id},data:{status:'ANALYZING',recommendation,version:{increment:1}}});
      await tx.audit.create({data:{requestId:r.id,actorId:'worker:rules-1',action:'ANALYZED',correlationId:p.correlationId,change:{from:r.status,to:'ANALYZING',recommendation}}});
      await tx.analysisEvent.update({where:{id:event.id},data:{processedAt:new Date(),attempts:{increment:1},lastError:null,attemptsLog:{create:{number:event.replays*3+event.attempts+1,success:true}}}});
      return 'PROCESSED';
    },{timeout:5000});
  }
  async failure(p:Envelope){
    // Não persiste stack, payload ou detalhes possivelmente sensíveis.
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "CreditRequest" WHERE id=${p.requestId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "AnalysisEvent" WHERE id=${p.eventId} FOR UPDATE`;
      const event=await tx.analysisEvent.findUnique({where:{id:p.eventId}});
      if(!event||event.requestId!==p.requestId||event.correlationId!==p.correlationId)return 'POISON';
      if(event.processedAt)return 'DUPLICATE';if(event.deadAt)return 'DEAD';
      const attempts=event.attempts+1,dead=attempts>=3;
      await tx.analysisEvent.update({where:{id:event.id},data:{attempts,lastError:'ANALYSIS_FAILED',...(dead?{deadAt:new Date()}:{}),attemptsLog:{create:{number:event.replays*3+attempts,success:false,error:'ANALYSIS_FAILED'}}}});
      await tx.audit.create({data:{requestId:p.requestId,actorId:'worker:rules-1',action:dead?'ANALYSIS_DEAD':'ANALYSIS_FAILED',correlationId:p.correlationId,change:{eventId:p.eventId,attempts}}});
      return dead?'DEAD':'RETRY';
    });
  }
  async handle(message:QueueMessage){
    let p:Envelope;
    try{p=envelope(message.body);}catch{await this.queue.send({kind:'INVALID_ENVELOPE',messageId:message.id},true);await this.queue.ack(message.receipt);log('worker.poison',{messageId:message.id});return;}
    let state:string;
    try {state=await this.result(p);}catch{state=await this.failure(p);}
    log('worker.attempt',{eventId:p.eventId,correlationId:p.correlationId,state});
    if(state==='DEAD'||state==='POISON')await this.queue.send({...p,kind:state},true);
    // Somente após commit e, para falha terminal, após publicação na DLQ.
    if(state!=='RETRY')await this.queue.ack(message.receipt);
  }
}
