import { Controller,Get,Post,Patch,Body,Param,Query,Req,Res,UseGuards,UseInterceptors,UploadedFile,ParseUUIDPipe,ServiceUnavailableException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthService,SessionGuard } from './auth';
import { CreditService } from './credit';
import { Database,MotoStore,ElasticQueue } from './infra';
import { LoginDto,RequestDto,ListDto,DecisionDto,ReplayDto,ProducerDto,PropertyDto } from './dto';
import { openapi } from './openapi';
@Controller('api')
export class PublicController {
  constructor(private auth:AuthService,private db:Database,private store:MotoStore,private queue:ElasticQueue){}
  @Post('auth/login') login(@Body() dto:LoginDto,@Req() req:any){return this.auth.login(dto.email,dto.password,req.ip);}
  @Get('health') async health(){
    const checks:Record<string,boolean>={};
    await Promise.all([['database',()=>this.db.$queryRaw`SELECT 1`],['s3',()=>this.store.health()],['sqs',()=>this.queue.health()],['worker',async()=>{const h=await this.db.heartbeat.findUnique({where:{id:'analysis-worker'}});if(!h||Date.now()-h.at.getTime()>15000)throw Error('STALE');}]].map(async([name,fn]:any)=>{try{await fn();checks[name]=true;}catch{checks[name]=false;}}));
    if(Object.values(checks).some(x=>!x))throw new ServiceUnavailableException({message:'Componente local indisponível',checks});return {status:'ok',checks};
  }
  @Get('openapi.json') schema(){return openapi();}
  @Get('docs') docs(@Res() res:Response){res.type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>AgroCredit Lab | OpenAPI</title><style>body{font:16px system-ui;max-width:1000px;margin:50px auto;background:#f4f6f0;color:#193c30}article{background:white;padding:16px;border-bottom:1px solid #ddd}code{color:#28684c}a{color:#28684c}</style><h1>AgroCredit Lab · API</h1><p>Ambiente demonstrativo — dados e análises fictícios</p><p><a href="/api/openapi.json">Baixar contrato OpenAPI 3.0.3</a> · Importe este contrato no Swagger Editor local ou em um cliente HTTP local.</p><h2>Autenticação</h2><p>POST /api/auth/login retorna token de sessão. Envie Authorization: Bearer &lt;token&gt;. Sessões expiram em uma hora. Valores monetários devem ser strings, por exemplo "25000.10".</p>${Object.entries(openapi().paths).map(([path,methods]:any)=>Object.entries(methods).map(([method,op]:any)=>`<article><code>${method.toUpperCase()} ${path}</code><p>${op.summary}</p></article>`).join('')).join('')}</html>`);}
}
@UseGuards(SessionGuard)
@Controller('api')
export class CreditController {
  constructor(private service:CreditService,private db:Database){}
  @Get('auth/me') me(@Req() r:any){return r.actor;}
  @Post('auth/logout') async logout(@Req() r:any){await this.db.session.deleteMany({where:{id:r.sessionId}});return {ok:true};}
  @Get('dashboard') dashboard(@Req() r:any){return this.service.dashboard(r.actor);}
  @Get('producers') producers(@Req() r:any){return this.service.producers(r.actor);}
  @Post('producers') producer(@Body() dto:ProducerDto,@Req() r:any){return this.service.createProducer(dto,r.actor);}
  @Post('producers/:id/properties') property(@Param('id',ParseUUIDPipe) id:string,@Body() dto:PropertyDto,@Req() r:any){return this.service.createProperty(id,dto,r.actor);}
  @Get('requests') list(@Query() q:ListDto,@Req() r:any){return this.service.list(q,r.actor);}
  @Post('requests') create(@Body() dto:RequestDto,@Req() r:any){return this.service.create(dto,r.actor,r.cid);}
  @Get('requests/:id') get(@Param('id',ParseUUIDPipe) id:string,@Req() r:any){return this.service.get(id,r.actor);}
  @Patch('requests/:id') edit(@Param('id',ParseUUIDPipe) id:string,@Body() dto:RequestDto,@Req() r:any){return this.service.edit(id,dto,r.actor,r.cid);}
  @Post('requests/:id/submit') submit(@Param('id',ParseUUIDPipe) id:string,@Req() r:any){return this.service.submit(id,r.actor,r.cid);}
  @Post('requests/:id/decision') decide(@Param('id',ParseUUIDPipe) id:string,@Body() dto:DecisionDto,@Req() r:any){return this.service.decide(id,dto,r.actor,r.cid);}
  @Post('requests/:id/documents') @UseInterceptors(FileInterceptor('file',{limits:{fileSize:5*1024*1024,files:1,fields:0}}))
  upload(@Param('id',ParseUUIDPipe) id:string,@UploadedFile() file:any,@Req() r:any){return this.service.upload(id,file,r.actor,r.cid);}
  @Get('requests/:id/documents/:documentId/download') download(@Param('id',ParseUUIDPipe) id:string,@Param('documentId',ParseUUIDPipe) doc:string,@Req() r:any){return this.service.download(id,doc,r.actor,r.cid);}
  @Post('requests/:id/events/:eventId/replay') replay(@Param('id',ParseUUIDPipe) id:string,@Param('eventId',ParseUUIDPipe) eventId:string,@Body() dto:ReplayDto,@Req() r:any){return this.service.replay(id,eventId,dto.reason,r.actor,r.cid);}
}
