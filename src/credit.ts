import { Injectable,Inject,NotFoundException,ForbiddenException,ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Database, ObjectStore,OBJECT_STORE } from './infra';
import { Actor,analyst,applicant } from './auth';
import { RequestDto,ListDto,DecisionDto,ProducerDto,PropertyDto } from './dto';
import { money,transition,validateDocument } from './domain';
@Injectable()
export class CreditService {
  constructor(private db:Database,@Inject(OBJECT_STORE) private store:ObjectStore){}
  scope(actor:Actor){return actor.role==='ANALYST'?{}:{property:{producer:{ownerId:actor.id}}};}
  async get(id:string,actor:Actor,client:any=this.db){
    const r=await client.creditRequest.findFirst({where:{id,...this.scope(actor)},include:{property:{include:{producer:true}},documents:true,audits:{orderBy:{createdAt:'asc'}},events:{include:{attemptsLog:{orderBy:{createdAt:'asc'}}},orderBy:{createdAt:'desc'}}}});
    if(!r)throw new NotFoundException('Solicitação não encontrada');return r;
  }
  async locked(tx:Prisma.TransactionClient,id:string,actor:Actor){
    await tx.$queryRaw`SELECT id FROM "CreditRequest" WHERE id=${id} FOR UPDATE`;
    return this.get(id,actor,tx);
  }
  async producers(actor:Actor){return this.db.producer.findMany({where:actor.role==='ANALYST'?{}:{ownerId:actor.id},include:{properties:true},orderBy:{name:'asc'}});}
  async createProducer(dto:ProducerDto,actor:Actor){applicant(actor);return this.db.producer.create({data:{name:dto.name,syntheticCode:'SYN-'+randomUUID(),ownerId:actor.id}});}
  async createProperty(id:string,dto:PropertyDto,actor:Actor){
    applicant(actor);if(!await this.db.producer.findFirst({where:{id,ownerId:actor.id}}))throw new NotFoundException('Produtor não encontrado');
    return this.db.property.create({data:{...dto,hectares:money(dto.hectares,true),producerId:id}});
  }
  async list(query:ListDto,actor:Actor){
    const where:Prisma.CreditRequestWhereInput={...this.scope(actor),...(query.status?{status:query.status}:{}),...(query.q?{OR:[{purpose:{contains:query.q,mode:'insensitive'}},{property:{producer:{name:{contains:query.q,mode:'insensitive'}}}}]}:{})};
    const [total,items]=await this.db.$transaction([this.db.creditRequest.count({where}),this.db.creditRequest.findMany({where,include:{property:{include:{producer:true}}},skip:(query.page-1)*query.limit,take:query.limit,orderBy:[{[query.sort]:query.direction},{id:'asc'}]})],{isolationLevel:'RepeatableRead'});
    return {total,items,page:query.page,limit:query.limit};
  }
  async dashboard(actor:Actor){
    const where=this.scope(actor);
    const [groups,sum]=await this.db.$transaction([this.db.creditRequest.groupBy({by:['status'],where,_count:true,orderBy:{status:'asc'}}),this.db.creditRequest.aggregate({where,_sum:{amount:true},_count:true})],{isolationLevel:'RepeatableRead'});
    return {total:sum._count,amount:sum._sum.amount?.toFixed(2)??'0.00',statuses:Object.fromEntries(groups.map(g=>[g.status,g._count]))};
  }
  async create(dto:RequestDto,actor:Actor,cid:string){
    applicant(actor);if(!await this.db.property.findFirst({where:{id:dto.propertyId,producer:{ownerId:actor.id}}}))throw new NotFoundException('Propriedade não encontrada');
    return this.db.creditRequest.create({data:{...dto,amount:money(dto.amount,true),revenue:money(dto.revenue),costs:money(dto.costs),debt:money(dto.debt),audits:{create:{actorId:actor.id,action:'CREATED',correlationId:cid,change:{status:'DRAFT',amount:dto.amount,purpose:dto.purpose}}}}});
  }
  async edit(id:string,dto:RequestDto,actor:Actor,cid:string){
    applicant(actor);
    return this.db.$transaction(async tx=>{const r=await this.locked(tx,id,actor);if(r.status!=='DRAFT')throw new ConflictException('Somente rascunhos podem ser editados');
      if(r.propertyId!==dto.propertyId)throw new ConflictException('A propriedade do rascunho é fixa');
      const before={amount:r.amount.toFixed(2),purpose:r.purpose,months:r.months,revenue:r.revenue.toFixed(2),costs:r.costs.toFixed(2),debt:r.debt.toFixed(2)};
      return tx.creditRequest.update({where:{id},data:{...dto,amount:money(dto.amount,true),revenue:money(dto.revenue),costs:money(dto.costs),debt:money(dto.debt),version:{increment:1},audits:{create:{actorId:actor.id,action:'EDITED',correlationId:cid,change:{before,after:dto as any}}}}});});
  }
  async submit(id:string,actor:Actor,cid:string){
    applicant(actor);return this.db.$transaction(async tx=>{const r=await this.locked(tx,id,actor);transition(r.status,'SUBMITTED');
      return tx.creditRequest.update({where:{id},data:{status:'SUBMITTED',version:{increment:1},events:{create:{correlationId:cid}},audits:{create:{actorId:actor.id,action:'SUBMITTED',correlationId:cid,change:{from:r.status,to:'SUBMITTED'}}}}});});
  }
  async decide(id:string,dto:DecisionDto,actor:Actor,cid:string){
    analyst(actor);return this.db.$transaction(async tx=>{const r=await this.locked(tx,id,actor);transition(r.status,dto.status);if(!r.recommendation)throw new ConflictException('Aguarde a análise automática');
      return tx.creditRequest.update({where:{id},data:{status:dto.status,justification:dto.justification.trim(),version:{increment:1},audits:{create:{actorId:actor.id,action:'DECIDED',correlationId:cid,change:{from:r.status,to:dto.status,justification:dto.justification.trim()}}}}});});
  }
  async upload(id:string,file:{buffer:Buffer;mimetype:string;originalname:string}|undefined,actor:Actor,cid:string){
    applicant(actor);await this.get(id,actor);if(!file)throw new ConflictException('Selecione um documento');validateDocument(file.buffer,file.mimetype);
    const key=`requests/${id}/${randomUUID()}`;await this.store.put(key,file.buffer,file.mimetype);
    try{return await this.db.$transaction(async tx=>{const r=await this.locked(tx,id,actor);if(r.status!=='DRAFT')throw new ConflictException('Anexos somente em rascunhos');
      const document=await tx.document.create({data:{requestId:id,key,name:file.originalname.replace(/[\x00-\x1f\\/<>]/g,'_').slice(0,120),mime:file.mimetype,size:file.buffer.length}});
      await tx.audit.create({data:{requestId:id,actorId:actor.id,action:'DOCUMENT_UPLOADED',correlationId:cid,change:{documentId:document.id,mime:document.mime,size:document.size}}});return document;});}
    catch(e){await this.store.remove(key).catch(()=>undefined);throw e;}
  }
  async download(id:string,documentId:string,actor:Actor,cid:string){
    await this.get(id,actor);const doc=await this.db.document.findFirst({where:{id:documentId,requestId:id}});if(!doc)throw new NotFoundException('Documento não encontrado');
    await this.db.audit.create({data:{requestId:id,actorId:actor.id,action:'DOCUMENT_URL_ISSUED',correlationId:cid,change:{documentId}}});
    return {url:await this.store.download(doc.key),expiresIn:60};
  }
  async replay(id:string,eventId:string,reason:string,actor:Actor,cid:string){
    analyst(actor);return this.db.$transaction(async tx=>{const r=await this.locked(tx,id,actor);if(!['SUBMITTED','ANALYZING'].includes(r.status))throw new ConflictException('Estado não permite reprocessar');
      const event=await tx.analysisEvent.findFirst({where:{id:eventId,requestId:id,deadAt:{not:null},processedAt:null}});
      if(!event||event.replays>=3)throw new ConflictException('Evento não está morto ou limite de 3 reprocessamentos atingido');
      await tx.analysisEvent.update({where:{id:eventId},data:{deadAt:null,dispatchedAt:null,attempts:0,lastError:null,replays:{increment:1}}});
      await tx.audit.create({data:{requestId:id,actorId:actor.id,action:'REPROCESS_REQUESTED',correlationId:cid,change:{eventId,reason}}});return {queued:true};});
  }
}
