import {AuthService,SessionGuard,analyst} from '../src/auth';
import {hash} from 'bcryptjs';
import {randomBytes} from 'node:crypto';
describe('autenticação e autorização',()=>{
 test('hash seguro; token opaco só é persistido como SHA-256',async()=>{const db:any={user:{findUnique:jest.fn().mockResolvedValue({id:'u',role:'APPLICANT',name:'Fictício',email:'u@a.test',passwordHash:await hash('Ficticio!2026',12)})},session:{create:jest.fn()}};const result=await new AuthService(db).login('u@a.test','Ficticio!2026','127.0.0.1');expect(result.token).toMatch(/^[a-f0-9]{64}$/);expect(db.session.create.mock.calls[0][0].data.id).not.toBe(result.token);expect(result.user).not.toHaveProperty('passwordHash');await expect(new AuthService(db).login('u@a.test','wrong!pass','127.0.0.1')).rejects.toThrow();});
 test('guard recusa ausência, expiração e sessão desconhecida',async()=>{const db:any={session:{findUnique:jest.fn().mockResolvedValue(null)}};const ctx=(auth?:string)=>({switchToHttp:()=>({getRequest:()=>({headers:{authorization:auth}})})}) as any;const guard=new SessionGuard(db);await expect(guard.canActivate(ctx())).rejects.toThrow();await expect(guard.canActivate(ctx('Bearer '+randomBytes(32).toString('hex')))).rejects.toThrow();db.session.findUnique.mockResolvedValue({expiresAt:new Date(0),user:{}});await expect(guard.canActivate(ctx('Bearer '+randomBytes(32).toString('hex')))).rejects.toThrow();});
 test('papel de solicitante não pode decidir',()=>expect(()=>analyst({id:'u',email:'u@a.test',name:'Fictício',role:'APPLICANT'})).toThrow());
});
