import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { randomBytes,createHash } from 'node:crypto';
import { compare } from 'bcryptjs';
import { Database } from './infra';
export type Actor={id:string;name:string;email:string;role:'APPLICANT'|'ANALYST'};
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
@Injectable()
export class AuthService {
  private attempts=new Map<string,{n:number;until:number}>();
  constructor(private db:Database){}
  async login(email:string,password:string,ip:string){
    const key=digest(ip);const existing=this.attempts.get(key);const a=existing&&existing.until>Date.now()?existing:{n:0,until:Date.now()+60000};
    a.n++;this.attempts.set(key,a);
    if(this.attempts.size>1000)for(const [k,v]of this.attempts)if(v.until<Date.now())this.attempts.delete(k);
    if(a.n>15)throw new ForbiddenException('Muitas tentativas. Aguarde um minuto.');
    const user=await this.db.user.findUnique({where:{email:email.toLowerCase()}});
    // Hash fictício evita retorno instantâneo para usuário inexistente.
    const valid=await compare(password,user?.passwordHash??'$2b$12$5Z72ln0cw5Vs0ksR5yIemejK3vE0hZnqkgYgMLb1sFpVqPPCCnXJK');
    if(!user||!valid)throw new UnauthorizedException('E-mail ou senha inválidos');
    const token=randomBytes(32).toString('hex');
    await this.db.session.create({data:{id:digest(token),userId:user.id,expiresAt:new Date(Date.now()+3600000)}});
    return {token,user:{id:user.id,email:user.email,name:user.name,role:user.role}};
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private db:Database){}
  async canActivate(ctx:ExecutionContext){
    const req=ctx.switchToHttp().getRequest();
    const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if(!token)throw new UnauthorizedException('Autenticação necessária');
    const session=await this.db.session.findUnique({where:{id:digest(token)},include:{user:true}});
    if(!session||session.expiresAt.getTime()<Date.now())throw new UnauthorizedException('Sessão expirada');
    req.actor={id:session.user.id,name:session.user.name,email:session.user.email,role:session.user.role};req.sessionId=session.id;
    return true;
  }
}
export function analyst(actor:Actor){if(actor.role!=='ANALYST')throw new ForbiddenException('Somente analistas');}
export function applicant(actor:Actor){if(actor.role!=='APPLICANT')throw new ForbiddenException('Somente solicitantes');}
