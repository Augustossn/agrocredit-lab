import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module,ValidationPipe,Catch,ExceptionFilter,ArgumentsHost,HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import { configuration } from './safety';
import { Database,MotoStore,ElasticQueue,OBJECT_STORE,log } from './infra';
import { AuthService,SessionGuard } from './auth';
import { CreditService } from './credit';
import { PublicController,CreditController } from './controllers';
@Module({providers:[Database,MotoStore,{provide:OBJECT_STORE,useExisting:MotoStore},ElasticQueue,AuthService,SessionGuard,CreditService],exports:[Database,MotoStore,ElasticQueue,AuthService,SessionGuard,CreditService]})
class ServicesModule {}
@Module({imports:[ServicesModule],controllers:[PublicController,CreditController]})
export class AppModule {}
@Catch()
class Errors implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost){const ctx=host.switchToHttp(),req=ctx.getRequest(),res=ctx.getResponse();const status=error instanceof HttpException?error.getStatus():500;const detail=error instanceof HttpException?error.getResponse():null;
    const message=typeof detail==='string'?detail:(detail as any)?.message??'Erro interno; consulte o identificador de correlação';
    if(status===500)log('api.error',{correlationId:req.cid,code:'UNEXPECTED_ERROR'});
    res.status(status).json({statusCode:status,message,correlationId:req.cid,...((detail as any)?.checks?{checks:(detail as any).checks}:{})});}
}
export async function createApp(){
  const cfg=configuration();const app=await NestFactory.create(AppModule,{logger:false});
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"]}}}));
  app.enableCors({origin:cfg.origin,methods:['GET','POST','PATCH'],allowedHeaders:['Authorization','Content-Type']});
  app.use((req:any,res:any,next:any)=>{req.cid=randomUUID();res.setHeader('x-correlation-id',req.cid);res.on('finish',()=>log('api.request',{correlationId:req.cid,method:req.method,status:res.statusCode}));next();});
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));app.useGlobalFilters(new Errors());app.enableShutdownHooks();
  await app.get(Database).$connect();await app.get(MotoStore).initialize();await app.get(ElasticQueue).initialize();
  return app;
}
async function main(){const cfg=configuration(),app=await createApp();await app.listen(cfg.port,'127.0.0.1');log('api.started',{port:cfg.port});}
if(require.main===module)main().catch(()=>{log('api.fatal',{code:'STARTUP_FAILED'});process.exitCode=1;});
