import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, Status } from '@prisma/client';
export const MONEY = /^(?:0|[1-9]\d{0,13})\.\d{2}$/;
export function money(value:string, positive=false) {
  if (!MONEY.test(value)) throw new BadRequestException('Valor deve ser uma string decimal com duas casas');
  const result = new Prisma.Decimal(value);
  if (positive && result.lte(0)) throw new BadRequestException('Valor deve ser positivo');
  return result;
}
export function transition(from:Status,to:Status) {
  const next:Record<Status,Status[]> = {DRAFT:['SUBMITTED'],SUBMITTED:['ANALYZING'],ANALYZING:['APPROVED','REJECTED'],APPROVED:[],REJECTED:[]};
  if (!next[from].includes(to)) throw new ConflictException(`Transição inválida: ${from} → ${to}`);
}
export function recommend(input:{amount:Prisma.Decimal;revenue:Prisma.Decimal;costs:Prisma.Decimal;debt:Prisma.Decimal;months:number}) {
  const margin=input.revenue.minus(input.costs);
  const commitment=input.amount.plus(input.debt).div(input.months);
  const capacity=margin.div(12);
  const ratio=capacity.gt(0)?commitment.div(capacity):new Prisma.Decimal(999);
  const score=ratio.lte('0.35')?85:ratio.lte('0.65')?60:25;
  return {version:'rules-1',score,label:score>=60?'FAVORABLE':'CAUTION',monthlyCapacity:capacity.toFixed(2),monthlyCommitment:commitment.toFixed(2),explanation:score>=60?'Comprometimento sintético dentro do limite demonstrativo.':'Comprometimento sintético elevado. Revisão humana necessária.',disclaimer:'Recomendação fictícia; não é decisão de crédito.'};
}
export function validateDocument(buffer:Buffer,mime:string) {
  if (!buffer.length || buffer.length>5*1024*1024) throw new BadRequestException('Documento deve ter entre 1 byte e 5 MiB');
  const signatures:Record<string,boolean>={'application/pdf':buffer.subarray(0,5).toString()==='%PDF-','image/png':buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'image/jpeg':buffer[0]===255&&buffer[1]===216&&buffer[2]===255};
  if (!signatures[mime]) throw new BadRequestException('Formato ou assinatura inválida. Use PDF, PNG ou JPEG');
}
