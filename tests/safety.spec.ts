import {configuration,localEndpoint} from '../src/safety';
const env={DATABASE_URL:'postgresql://agrolab:local-only@127.0.0.1:55432/agrocredit?schema=public',S3_ENDPOINT:'http://127.0.0.1:5000',SQS_ENDPOINT:'http://127.0.0.1:9324',AWS_ACCESS_KEY_ID:'agrolab-local',AWS_SECRET_ACCESS_KEY:'agrolab-local-secret',WEB_ORIGIN:'http://127.0.0.1:5173'};
describe('bloqueio fail-fast de destinos externos',()=>{
 test('aceita apenas configuração local explícita',()=>expect(configuration(env).s3).toBe(env.S3_ENDPOINT));
 test.each(['https://s3.amazonaws.com','https://sqs.us-east-1.amazonaws.com','http://localhost:5000','http://127.0.0.1.evil.test:5000','http://evil.test:5000','http://169.254.169.254:5000','http://127.0.0.1:443','http://user:pass@127.0.0.1:5000','http://127.0.0.1:5000/path','http://127.0.0.1:5000?next=aws'])('recusa %s',v=>expect(()=>localEndpoint(v,[5000],'S3')).toThrow());
 test('recusa credenciais reais e perfis herdados',()=>{expect(()=>configuration({...env,AWS_ACCESS_KEY_ID:'AKIAREAL'})).toThrow();expect(()=>configuration({...env,AWS_PROFILE:'default'})).toThrow();expect(()=>configuration({...env,AWS_SESSION_TOKEN:'real'})).toThrow();});
 test('recusa PostgreSQL externo e banco incorreto',()=>{expect(()=>configuration({...env,DATABASE_URL:'postgresql://u:p@db.example.com:55432/agrocredit?schema=public'})).toThrow();expect(()=>configuration({...env,DATABASE_URL:env.DATABASE_URL.replace('agrocredit?','other?')})).toThrow();});
 test('testes jamais usam os serviços de desenvolvimento',()=>expect(()=>configuration({...env,NODE_ENV:'test'})).toThrow());
});
