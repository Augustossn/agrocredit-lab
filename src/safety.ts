import 'dotenv/config';

export function localEndpoint(value: string | undefined, ports: number[], label: string): string {
  if (!value) throw new Error(`${label}: endpoint local explícito obrigatório`);
  const u = new URL(value);
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !ports.includes(Number(u.port)) || u.username || u.password || u.pathname !== '/' || u.search || u.hash)
    throw new Error(`${label}: somente HTTP em 127.0.0.1 e portas locais autorizadas`);
  return u.origin;
}
export function configuration(env: NodeJS.ProcessEnv = process.env) {
  const s3 = localEndpoint(env.S3_ENDPOINT,[5000,15000],'S3');
  const sqs = localEndpoint(env.SQS_ENDPOINT,[9324,19324],'SQS');
  const db = new URL(env.DATABASE_URL ?? 'invalid:');
  if (db.protocol !== 'postgresql:' || db.hostname !== '127.0.0.1' || !['55432','55433'].includes(db.port) || !['/agrocredit','/agrocredit_test'].includes(db.pathname) || db.search !== '?schema=public') throw new Error('PostgreSQL: destino local não autorizado');
  const testing = env.NODE_ENV === 'test';
  if (testing && (db.pathname !== '/agrocredit_test' || db.port !== '55433' || s3 !== 'http://127.0.0.1:15000' || sqs !== 'http://127.0.0.1:19324')) throw new Error('Testes exigem banco, portas e emuladores isolados');
  if (env.AWS_ACCESS_KEY_ID !== 'agrolab-local' || env.AWS_SECRET_ACCESS_KEY !== 'agrolab-local-secret' || env.AWS_SESSION_TOKEN || env.AWS_PROFILE) throw new Error('Somente credenciais fictícias explícitas; remova AWS_PROFILE/AWS_SESSION_TOKEN');
  const bucket = testing ? 'agrocredit-test-documents' : 'agrocredit-documents';
  const queue = testing ? 'agrocredit-test-analysis' : 'agrocredit-analysis';
  if (env.BUCKET && env.BUCKET !== bucket || env.QUEUE && env.QUEUE !== queue) throw new Error('Namespace local inválido');
  const origin = localEndpoint(env.WEB_ORIGIN,[5173,15173],'Frontend');
  const port = Number(env.PORT ?? 3000);
  if (![3000,13000].includes(port)) throw new Error('Porta API não autorizada');
  return {s3,sqs,bucket,queue,origin,port,databaseUrl:db.href,credentials:{accessKeyId:'agrolab-local',secretAccessKey:'agrolab-local-secret'},region:'us-east-1'};
}
