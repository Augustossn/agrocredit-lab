import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import {createApp} from '../src/main';
import {Database,ElasticQueue,MotoStore} from '../src/infra';
import {Processor} from '../src/processor';
import {configuration} from '../src/safety';
import {randomUUID} from 'node:crypto';
const suite=process.env.RUN_INTEGRATION==='1'?describe:describe.skip;
suite('PostgreSQL + API + adaptadores S3/SQS (serviços isolados)',()=>{
 let app:INestApplication,db:Database,queue:ElasticQueue,applicant:string,analyst:string,other:string,propertyId:string;
 const auth=(token:string)=>({Authorization:'Bearer '+token});
 const dto=()=>({propertyId,amount:'25000.10',purpose:'Safra sintética '+randomUUID(),months:36,revenue:'240000.00',costs:'100000.00',debt:'5000.00'});
 beforeAll(async()=>{
  const config=configuration();if(config.queue!=='agrocredit-test-analysis')throw Error('Namespace isolado obrigatório');app=await createApp();await app.init();db=app.get(Database);queue=app.get(ElasticQueue);
  await queue.call('PurgeQueue',{QueueUrl:queue.mainUrl});await queue.call('PurgeQueue',{QueueUrl:queue.deadUrl});
  async function login(email:string){const r=await request(app.getHttpServer()).post('/api/auth/login').send({email,password:'Ficticio!2026'}).expect(201);return r.body.token;}
  applicant=await login('solicitante@agrolab.test');analyst=await login('analista@agrolab.test');other=await login('outro@agrolab.test');
  const p=await request(app.getHttpServer()).get('/api/producers').set(auth(applicant)).expect(200);propertyId=p.body[0].properties[0].id;
 });
 afterAll(async()=>{if(app)await app.close();});
 test('autenticação, papel e validação não dependem do frontend',async()=>{
  await request(app.getHttpServer()).get('/api/requests').expect(401);
  await request(app.getHttpServer()).post('/api/auth/login').send({email:'solicitante@agrolab.test',password:'invalid-pass'}).expect(401);
  await request(app.getHttpServer()).post('/api/requests').set(auth(analyst)).send(dto()).expect(403);
  await request(app.getHttpServer()).post('/api/requests').set(auth(applicant)).send({...dto(),amount:'0.001'}).expect(400);
  await request(app.getHttpServer()).post('/api/requests').set(auth(applicant)).send({...dto(),role:'ANALYST'}).expect(400);
 });
 test('transação faz rollback real no PostgreSQL e preserva centavos',async()=>{
  const data=dto();await expect(db.$transaction(async tx=>{await tx.creditRequest.create({data});throw Error('rollback controlado');})).rejects.toThrow('rollback');
  expect(await db.creditRequest.count({where:{purpose:data.purpose}})).toBe(0);
  const rows=await db.$queryRaw<any[]>`SELECT 0.10::numeric + 0.20::numeric AS value`;expect(rows[0].value.toFixed(2)).toBe('0.30');
 });
 test('documentos: acesso privado, assinatura local e validação de conteúdo',async()=>{
  const r=await request(app.getHttpServer()).post('/api/requests').set(auth(applicant)).send(dto()).expect(201);const id=r.body.id;
  const d=await request(app.getHttpServer()).post(`/api/requests/${id}/documents`).set(auth(applicant)).attach('file',Buffer.from('%PDF-1.4\nDados inteiramente fictícios\n%%EOF'),{filename:'sintetico.pdf',contentType:'application/pdf'}).expect(201);
  await request(app.getHttpServer()).get(`/api/requests/${id}`).set(auth(other)).expect(404);
  await request(app.getHttpServer()).get(`/api/requests/${id}/documents/${d.body.id}/download`).set(auth(other)).expect(404);
  await request(app.getHttpServer()).post(`/api/requests/${id}/documents`).set(auth(applicant)).attach('file',Buffer.from('not-pdf'),{filename:'bad.pdf',contentType:'application/pdf'}).expect(400);
  const signed=await request(app.getHttpServer()).get(`/api/requests/${id}/documents/${d.body.id}/download`).set(auth(applicant)).expect(200);
  expect(signed.body.url).toContain('127.0.0.1:15000');expect(signed.body.url).toContain('X-Amz-Signature');expect((await fetch(signed.body.url)).status).toBe(200);
 });
 test('outbox, entrega duplicada concorrente e decisão humana exatamente uma vez',async()=>{
  const r=await request(app.getHttpServer()).post('/api/requests').set(auth(applicant)).send(dto()).expect(201);const id=r.body.id;
  await request(app.getHttpServer()).post(`/api/requests/${id}/decision`).set(auth(analyst)).send({status:'APPROVED',justification:'Decisão fictícia suficiente.'}).expect(409);
  await request(app.getHttpServer()).post(`/api/requests/${id}/submit`).set(auth(applicant)).expect(201);
  await request(app.getHttpServer()).post(`/api/requests/${id}/submit`).set(auth(applicant)).expect(409);
  const event=await db.analysisEvent.findFirstOrThrow({where:{requestId:id}}),p={eventId:event.id,requestId:id,correlationId:event.correlationId};
  const processor=new Processor(db,queue);const results=await Promise.all([processor.result(p),processor.result(p)]);expect(results.sort()).toEqual(['DUPLICATE','PROCESSED']);
  expect(await db.audit.count({where:{requestId:id,action:'ANALYZED'}})).toBe(1);
  const saved=await db.creditRequest.findUniqueOrThrow({where:{id}});expect(saved.amount.toFixed(2)).toBe('25000.10');expect(saved.status).toBe('ANALYZING');
  await request(app.getHttpServer()).post(`/api/requests/${id}/decision`).set(auth(applicant)).send({status:'APPROVED',justification:'Decisão fictícia suficiente.'}).expect(403);
  await request(app.getHttpServer()).post(`/api/requests/${id}/decision`).set(auth(analyst)).send({status:'APPROVED',justification:'   '}).expect(400);
  const decisions=await Promise.all([1,2].map(()=>request(app.getHttpServer()).post(`/api/requests/${id}/decision`).set(auth(analyst)).send({status:'APPROVED',justification:'Capacidade sintética aprovada após revisão humana.'})));expect(decisions.map(r=>r.status).sort()).toEqual([201,409]);
  expect(await db.audit.count({where:{requestId:id,action:'DECIDED'}})).toBe(1);
 });
 test('SQS: falha, retries limitados, DLQ e reprocessamento autorizado',async()=>{
  const r=await request(app.getHttpServer()).post('/api/requests').set(auth(applicant)).send(dto()).expect(201);const id=r.body.id;
  await request(app.getHttpServer()).post(`/api/requests/${id}/submit`).set(auth(applicant)).expect(201);
  const event=await db.analysisEvent.findFirstOrThrow({where:{requestId:id}}),p={eventId:event.id,requestId:id,correlationId:event.correlationId};
  await queue.send(p);const processor=new Processor(db,queue,()=>{throw Error('falha injetada apenas no teste')});
  for(let i=0;i<3;i++){let messages=await queue.receive();expect(messages.length).toBeGreaterThan(0);const msg=messages[0];await processor.handle(msg);if(i<2)await queue.call('ChangeMessageVisibility',{QueueUrl:queue.mainUrl,ReceiptHandle:msg.receipt,VisibilityTimeout:'0'});}
  const failed=await db.analysisEvent.findUniqueOrThrow({where:{id:event.id}});expect(failed.attempts).toBe(3);expect(failed.deadAt).not.toBeNull();expect(failed.processedAt).toBeNull();
  const dlq=await queue.call('ReceiveMessage',{QueueUrl:queue.deadUrl,MaxNumberOfMessages:'10'});expect(JSON.stringify(dlq)).toContain(event.id);
  expect(await db.audit.count({where:{requestId:id,action:'ANALYZED'}})).toBe(0);
  await request(app.getHttpServer()).post(`/api/requests/${id}/events/${event.id}/replay`).set(auth(applicant)).send({reason:'Repetir análise fictícia.'}).expect(403);
  await request(app.getHttpServer()).post(`/api/requests/${id}/events/${event.id}/replay`).set(auth(analyst)).send({reason:'Falha local corrigida para demonstração.'}).expect(201);
  await new Processor(db,queue).result(p);expect(await db.audit.count({where:{requestId:id,action:'ANALYZED'}})).toBe(1);
 });
});
