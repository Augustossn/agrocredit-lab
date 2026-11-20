import {MotoStore,ElasticQueue} from '../src/infra';
import {randomUUID} from 'node:crypto';
const suite=process.env.RUN_ADAPTERS==='1'?describe:describe.skip;
suite('contratos HTTP S3/SQS contra serviços locais isolados',()=>{
 test('bucket, upload e URL pré-assinada de download',async()=>{const store=new MotoStore();await store.initialize();const key='contract/'+randomUUID(),bytes=Buffer.from('%PDF-1.4 synthetic');await store.put(key,bytes,'application/pdf');const url=await store.download(key);const response=await fetch(url);expect(response.status).toBe(200);expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);await store.remove(key);});
 test('fila, visibilidade e confirmação',async()=>{const queue=new ElasticQueue();await queue.initialize();const body={contract:randomUUID()};await queue.send(body);const messages=await queue.receive();expect(messages).toHaveLength(1);expect(JSON.parse(messages[0].body)).toEqual(body);expect(await queue.receive()).toHaveLength(0);await queue.ack(messages[0].receipt);expect(await queue.receive()).toHaveLength(0);});
});
