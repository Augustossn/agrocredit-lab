import {Processor,envelope} from '../src/processor';
import {randomUUID} from 'node:crypto';
const event={eventId:randomUUID(),requestId:randomUUID(),correlationId:randomUUID()};
const message={id:'m',body:JSON.stringify(event),receipt:'receipt',receives:1};
describe('contrato de confirmação do worker',()=>{
 test('somente confirma após persistência do resultado',async()=>{const order:string[]=[];const q:any={send:jest.fn(),ack:jest.fn(async()=>{order.push('ack')})};const processor=new Processor({} as any,q);jest.spyOn(processor,'result').mockImplementation(async()=>{order.push('commit');return 'PROCESSED'});await processor.handle(message);expect(order).toEqual(['commit','ack']);});
 test('duplicata é confirmada sem reaplicar resultado',async()=>{const q:any={send:jest.fn(),ack:jest.fn()};const processor=new Processor({} as any,q);jest.spyOn(processor,'result').mockResolvedValue('DUPLICATE');await processor.handle(message);expect(q.ack).toHaveBeenCalledTimes(1);expect(q.send).not.toHaveBeenCalled();});
 test('falha transitória não confirma mensagem',async()=>{const q:any={send:jest.fn(),ack:jest.fn()};const processor=new Processor({} as any,q);jest.spyOn(processor,'result').mockRejectedValue(Error('temporary'));jest.spyOn(processor,'failure').mockResolvedValue('RETRY');await processor.handle(message);expect(q.ack).not.toHaveBeenCalled();});
 test('falha terminal só confirma após publicar na DLQ',async()=>{const order:string[]=[];const q:any={send:jest.fn(async()=>{order.push('dlq')}),ack:jest.fn(async()=>{order.push('ack')})};const processor=new Processor({} as any,q);jest.spyOn(processor,'result').mockResolvedValue('DEAD');await processor.handle(message);expect(order).toEqual(['dlq','ack']);});
 test('falha ao publicar na DLQ mantém a mensagem original',async()=>{const q:any={send:jest.fn().mockRejectedValue(Error('queue down')),ack:jest.fn()};const processor=new Processor({} as any,q);jest.spyOn(processor,'result').mockResolvedValue('DEAD');await expect(processor.handle(message)).rejects.toThrow();expect(q.ack).not.toHaveBeenCalled();});
 test('JSON inválido vai para quarentena sem incluir conteúdo',async()=>{const q:any={send:jest.fn(),ack:jest.fn()};await new Processor({} as any,q).handle({...message,body:'malformed secret'});expect(q.send).toHaveBeenCalledWith({kind:'INVALID_ENVELOPE',messageId:'m'},true);});
 test('valida correlação e IDs',()=>{expect(envelope(message.body)).toEqual(event);expect(()=>envelope(JSON.stringify({...event,correlationId:'abc'}))).toThrow();});
});
