import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { S3Client,CreateBucketCommand,PutBucketCorsCommand,PutObjectCommand,GetObjectCommand,HeadBucketCommand,DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { XMLParser } from 'fast-xml-parser';
import { configuration } from './safety';

export function log(event:string,fields:Record<string,unknown>={}) { console.log(JSON.stringify({time:new Date().toISOString(),event,...fields})); }
@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  constructor(){super({datasources:{db:{url:configuration().databaseUrl}}});}
  async onModuleDestroy(){await this.$disconnect();}
}
export interface ObjectStore {put(key:string,body:Buffer,mime:string):Promise<void>;download(key:string):Promise<string>;remove(key:string):Promise<void>;health():Promise<void>}
export const OBJECT_STORE=Symbol('LOCAL_OBJECT_STORE');
export interface QueueMessage {body:string;receipt:string;id:string;receives:number}
export interface QueuePort {send(body:object,dead?:boolean):Promise<void>;receive():Promise<QueueMessage[]>;ack(receipt:string):Promise<void>}
@Injectable()
export class MotoStore implements ObjectStore {
  readonly cfg=configuration();
  readonly client=new S3Client({endpoint:this.cfg.s3,region:this.cfg.region,credentials:this.cfg.credentials,forcePathStyle:true,followRegionRedirects:false,maxAttempts:1});
  async initialize(){
    try {await this.health();} catch(e:any){if(e?.$metadata?.httpStatusCode!==404)throw e;await this.client.send(new CreateBucketCommand({Bucket:this.cfg.bucket}));}
    await this.client.send(new PutBucketCorsCommand({Bucket:this.cfg.bucket,CORSConfiguration:{CORSRules:[{AllowedOrigins:[this.cfg.origin],AllowedMethods:['GET'],AllowedHeaders:['*']}]}}));
  }
  async health(){await this.client.send(new HeadBucketCommand({Bucket:this.cfg.bucket}));}
  async put(key:string,body:Buffer,mime:string){await this.client.send(new PutObjectCommand({Bucket:this.cfg.bucket,Key:key,Body:body,ContentType:mime}));}
  async remove(key:string){await this.client.send(new DeleteObjectCommand({Bucket:this.cfg.bucket,Key:key}));}
  async download(key:string){return getSignedUrl(this.client,new GetObjectCommand({Bucket:this.cfg.bucket,Key:key,ResponseContentDisposition:'attachment'}),{expiresIn:60});}
}
// ElasticMQ suporta a API SQS Query. Nenhum credential provider ou endpoint AWS implícito.
@Injectable()
export class ElasticQueue implements QueuePort {
  readonly cfg=configuration();
  readonly parser=new XMLParser({ignoreAttributes:false,parseTagValue:false});
  mainUrl=''; deadUrl='';
  async call(action:string,params:Record<string,string>={}) {
    const response=await fetch(this.cfg.sqs,{method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({Action:action,Version:'2012-11-05',...params}),signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error(`SQS_${action}_${response.status}`);
    const result=this.parser.parse(await response.text());
    if(result.ErrorResponse)throw new Error(`SQS_${action}_error`);
    return result[`${action}Response`]?.[`${action}Result`] ?? {};
  }
  async initialize(){
    this.deadUrl=(await this.call('CreateQueue',{QueueName:this.cfg.queue+'-dlq'})).QueueUrl;
    this.mainUrl=(await this.call('CreateQueue',{QueueName:this.cfg.queue})).QueueUrl;
    const attrs=await this.call('GetQueueAttributes',{QueueUrl:this.deadUrl,'AttributeName.1':'QueueArn'});
    const attr=Array.isArray(attrs.Attribute)?attrs.Attribute:[attrs.Attribute];
    const arn=attr.find((a:any)=>a?.Name==='QueueArn')?.Value;
    if(!arn)throw new Error('DLQ ARN ausente');
    await this.call('SetQueueAttributes',{QueueUrl:this.mainUrl,'Attribute.1.Name':'VisibilityTimeout','Attribute.1.Value':'15','Attribute.2.Name':'RedrivePolicy','Attribute.2.Value':JSON.stringify({deadLetterTargetArn:arn,maxReceiveCount:5})});
  }
  async send(body:object,dead=false){await this.call('SendMessage',{QueueUrl:dead?this.deadUrl:this.mainUrl,MessageBody:JSON.stringify(body)});}
  async receive():Promise<QueueMessage[]>{
    const r=await this.call('ReceiveMessage',{QueueUrl:this.mainUrl,MaxNumberOfMessages:'1',WaitTimeSeconds:'1','AttributeName.1':'ApproximateReceiveCount'});
    const msgs=r.Message?(Array.isArray(r.Message)?r.Message:[r.Message]):[];
    return msgs.map((m:any)=>({body:m.Body,receipt:m.ReceiptHandle,id:m.MessageId,receives:Number((Array.isArray(m.Attribute)?m.Attribute:[m.Attribute]).find((a:any)=>a?.Name==='ApproximateReceiveCount')?.Value??1)}));
  }
  async ack(receipt:string){await this.call('DeleteMessage',{QueueUrl:this.mainUrl,ReceiptHandle:receipt});}
  async health(){await this.call('GetQueueAttributes',{QueueUrl:this.mainUrl,'AttributeName.1':'QueueArn'});}
}
