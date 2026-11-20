import 'reflect-metadata';
import { hash } from 'bcryptjs';
import { Database,log } from './infra';
import { recommend } from './domain';
async function main(){
  const db=new Database();try{
    const password=process.env.DEMO_PASSWORD;if(!password||password.length<12||Buffer.byteLength(password)>72)throw Error('DEMO_PASSWORD local com pelo menos 12 caracteres e até 72 bytes obrigatória');
    const passwordHash=await hash(password,12);
    for(const [email,name,role]of [['solicitante@agrolab.test','Cooperativa Aurora · fictícia','APPLICANT'],['analista@agrolab.test','Marina · analista fictícia','ANALYST'],['outro@agrolab.test','Produtor Horizonte · fictício','APPLICANT']] as const){
      const user=await db.user.upsert({where:{email},update:{passwordHash},create:{email,name,role,passwordHash}});
      if(role==='ANALYST')continue;
      const producer=await db.producer.upsert({where:{syntheticCode:email==='outro@agrolab.test'?'SYN-002':'SYN-001'},update:{},create:{name:email==='outro@agrolab.test'?'Horizonte Experimental':'Cooperativa Aurora',syntheticCode:email==='outro@agrolab.test'?'SYN-002':'SYN-001',ownerId:user.id}});
      let property=await db.property.findFirst({where:{producerId:producer.id}});
      if(!property)property=await db.property.create({data:{producerId:producer.id,name:'Fazenda Boa Colheita · fictícia',city:'Planaltina / DF',hectares:'180.50'}});
      if(await db.creditRequest.count({where:{propertyId:property.id}}))continue;
      const scenarios=role==='APPLICANT'&&email!=='outro@agrolab.test'?[
        {purpose:'Custeio da safra de soja',amount:'85000.10',status:'DRAFT'},
        {purpose:'Irrigação eficiente de hortaliças',amount:'42000.00',status:'ANALYZING'},
        {purpose:'Modernização de equipamentos',amount:'125000.00',status:'APPROVED'},
        {purpose:'Expansão experimental de pastagem',amount:'250000.00',status:'REJECTED'}]:[{purpose:'Custeio reservado Horizonte',amount:'10000.00',status:'DRAFT'}];
      for(const s of scenarios){const r=await db.creditRequest.create({data:{propertyId:property.id,...s,status:s.status as any,months:36,revenue:'480000.00',costs:'180000.00',debt:'12000.00',...(s.status==='APPROVED'||s.status==='REJECTED'?{justification:'Decisão humana fictícia para demonstrar o histórico.'}:{}),audits:{create:{actorId:user.id,action:'DEMO_SEEDED',change:{scenario:s.status,note:'Cenário sintético pré-carregado; não representa operação real.'}}}}});
        if(s.status!=='DRAFT')await db.creditRequest.update({where:{id:r.id},data:{recommendation:recommend(r)}});
      }
    }
    log('seed.completed',{fictional:true});
  }finally{await db.$disconnect();}
}
main().catch(()=>{log('seed.failed');process.exitCode=1;});
