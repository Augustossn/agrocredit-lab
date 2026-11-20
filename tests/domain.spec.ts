import {money,transition,recommend,validateDocument} from '../src/domain';
describe('dinheiro e regras de negócio',()=>{
 test('preserva centavos e soma decimal sem ponto flutuante',()=>{expect(money('0.10').plus(money('0.20')).toFixed(2)).toBe('0.30');expect(money('99999999999999.99').toFixed(2)).toBe('99999999999999.99');});
 test.each(['1.234','1e5','-1.00','NaN','1,00','01.00','100000000000000.00'])('recusa formato inválido %s',v=>expect(()=>money(v)).toThrow());
 test('crédito precisa ser positivo',()=>expect(()=>money('0.00',true)).toThrow());
 test.each([['DRAFT','SUBMITTED'],['SUBMITTED','ANALYZING'],['ANALYZING','APPROVED'],['ANALYZING','REJECTED']] as const)('permite %s → %s',(a,b)=>expect(()=>transition(a,b)).not.toThrow());
 test.each([['DRAFT','APPROVED'],['SUBMITTED','REJECTED'],['APPROVED','ANALYZING'],['REJECTED','DRAFT'],['SUBMITTED','SUBMITTED']] as const)('bloqueia %s → %s',(a,b)=>expect(()=>transition(a,b)).toThrow());
 test('recomendação é determinística e não é decisão',()=>{const input={amount:money('25000.10'),revenue:money('240000.00'),costs:money('100000.00'),debt:money('5000.00'),months:36};expect(recommend(input)).toEqual(recommend(input));expect(recommend(input).score).toBe(85);expect(recommend({...input,revenue:money('0.00')})).toMatchObject({score:25,label:'CAUTION'});});
 test('valida assinatura real além do MIME declarado',()=>{expect(()=>validateDocument(Buffer.from('exe malicioso'),'application/pdf')).toThrow();expect(()=>validateDocument(Buffer.from('%PDF-1.4 synthetic'),'application/pdf')).not.toThrow();expect(()=>validateDocument(Buffer.alloc(5242881),'image/png')).toThrow();expect(()=>validateDocument(Buffer.alloc(0),'image/png')).toThrow();});
});
