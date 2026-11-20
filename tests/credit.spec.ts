import {CreditService} from '../src/credit';
const actor={id:'owner',name:'Fictício',email:'p@a.test',role:'APPLICANT'} as const;
describe('restrição de documentos no backend',()=>{
 test('não gera URL nem toca o S3 para recurso de outro proprietário',async()=>{const db:any={creditRequest:{findFirst:jest.fn().mockResolvedValue(null)}};const store:any={download:jest.fn(),put:jest.fn()};const service=new CreditService(db,store);await expect(service.download('other','doc',actor,'cid')).rejects.toThrow();expect(store.download).not.toHaveBeenCalled();expect(db.creditRequest.findFirst.mock.calls[0][0].where.property.producer.ownerId).toBe('owner');});
 test('analista não faz upload como solicitante',async()=>{const store:any={put:jest.fn()};await expect(new CreditService({} as any,store).upload('id',undefined,{...actor,role:'ANALYST'},'cid')).rejects.toThrow();expect(store.put).not.toHaveBeenCalled();});
});
