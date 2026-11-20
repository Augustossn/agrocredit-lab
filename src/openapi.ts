// Esquema OpenAPI independente de CDN e sem dependência de geração em nuvem.
import 'reflect-metadata';
const schemas:Record<string,any>={};
export function ApiProperty():PropertyDecorator{return(target,key)=>{const name=target.constructor.name;const s=schemas[name]??={type:'object',additionalProperties:false,properties:{},required:[]};const type=Reflect.getMetadata('design:type',target,key);s.properties[String(key)]={type:type===Number?'integer':'string'};s.required.push(String(key));};}
export function openapi(){
  const body=(name:string)=>({required:true,content:{'application/json':{schema:{$ref:`#/components/schemas/${name}`}}}});
  const op=(summary:string,schema?:string,auth=true)=>({summary,...(auth?{security:[{bearer:[]}]}:{}),...(schema?{requestBody:body(schema)}:{}),responses:{'200':{description:'Sucesso'},'400':{description:'Entrada inválida'},'401':{description:'Não autenticado'},'403':{description:'Sem permissão'},'404':{description:'Não encontrado'},'409':{description:'Conflito de estado'}}});
  const paths:any={
    '/api/auth/login':{post:op('Entrar com conta fictícia','LoginDto',false)},'/api/auth/me':{get:op('Sessão atual')},'/api/auth/logout':{post:op('Revogar sessão')},
    '/api/dashboard':{get:op('Indicadores do escopo autorizado')},'/api/producers':{get:op('Produtores e propriedades'),post:op('Cadastrar produtor sintético','ProducerDto')},
    '/api/producers/{id}/properties':{post:op('Cadastrar propriedade','PropertyDto')},
    '/api/requests':{get:{...op('Filtrar, ordenar e paginar solicitações'),parameters:[{name:'page',in:'query',schema:{type:'integer',minimum:1}},{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:50}},{name:'q',in:'query',schema:{type:'string'}},{name:'status',in:'query',schema:{type:'string',enum:['DRAFT','SUBMITTED','ANALYZING','APPROVED','REJECTED']}},{name:'sort',in:'query',schema:{enum:['createdAt','amount']}},{name:'direction',in:'query',schema:{enum:['asc','desc']}}]},post:op('Criar rascunho','RequestDto')},
    '/api/requests/{id}':{get:op('Detalhes, documentos e auditoria'),patch:op('Editar rascunho','RequestDto')},
    '/api/requests/{id}/submit':{post:op('Submeter e registrar outbox atomicamente')},'/api/requests/{id}/decision':{post:op('Decisão humana com justificativa','DecisionDto')},
    '/api/requests/{id}/documents':{post:{...op('Upload privado, até 5 MiB, PDF/PNG/JPEG'),requestBody:{required:true,content:{'multipart/form-data':{schema:{type:'object',required:['file'],properties:{file:{type:'string',format:'binary'}}}}}}}},
    '/api/requests/{id}/documents/{documentId}/download':{get:op('URL S3 local pré-assinada, válida por 60 segundos')},
    '/api/requests/{id}/events/{eventId}/replay':{post:op('Reprocessar evento morto (máximo 3 vezes)','ReplayDto')},
    '/api/health':{get:op('Saúde de PostgreSQL, S3, SQS e worker',undefined,false)}
  };
  for(const [path,item]of Object.entries(paths) as any)for(const operation of Object.values(item) as any[])if(path.includes('{'))operation.parameters=[...(operation.parameters??[]),...[...path.matchAll(/\{(\w+)\}/g)].map((m:any)=>({name:m[1],in:'path',required:true,schema:{type:'string',format:'uuid'}}))];
  schemas.RequestDto.properties.amount={type:'string',pattern:'^(0|[1-9][0-9]{0,13})\\.[0-9]{2}$',example:'25000.10'};
  schemas.DecisionDto.properties.status={type:'string',enum:['APPROVED','REJECTED']};
  return {openapi:'3.0.3',info:{title:'AgroCredit Lab — API local',version:'1.0.0',description:'Ambiente demonstrativo — dados e análises fictícios. Valores financeiros são strings decimais.'},servers:[{url:'http://127.0.0.1:'+ (process.env.PORT??3000)}],components:{securitySchemes:{bearer:{type:'http',scheme:'bearer'}},schemas},paths};
}
