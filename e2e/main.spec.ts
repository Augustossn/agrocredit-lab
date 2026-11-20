import {test,expect} from '@playwright/test';
test('solicitante cadastra, anexa e submete; analista decide e consulta auditoria',async({page})=>{
 const external:string[]=[];page.on('request',r=>{const u=new URL(r.url());if(!['127.0.0.1','localhost'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol))external.push(r.url());});
 await page.goto('/');await page.getByRole('button',{name:'Entrar na plataforma'}).click();await expect(page.getByRole('heading',{name:'Visão geral',exact:true})).toBeVisible();
 await page.screenshot({path:'docs/screenshots/dashboard-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Nova solicitação'}).click();const purpose='Safra E2E fictícia '+Date.now();await page.getByLabel('Finalidade',{exact:true}).fill(purpose);await page.getByRole('button',{name:'Salvar rascunho'}).click();
 await expect(page.getByRole('heading',{name:purpose,exact:true})).toBeVisible();
 await page.getByLabel('Adicionar documento',{exact:true}).setInputFiles({name:'sintetico.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nDocumento inteiramente fictício\n%%EOF')});await expect(page.getByText('sintetico.pdf',{exact:true})).toBeVisible();
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar',exact:true}).click();expect((await downloadEvent).suggestedFilename()).toBe('sintetico.pdf');
 await page.getByRole('button',{name:'Enviar para análise'}).click();await expect(page.getByRole('heading',{name:'Perspectiva favorável',exact:true})).toBeVisible({timeout:20000});
 await expect(page.getByText('Recomendação gerada',{exact:true})).toBeVisible();await page.screenshot({path:'docs/screenshots/request-analysis.png',fullPage:true});
 await page.getByRole('button',{name:'Sair',exact:true}).click();await page.getByRole('button',{name:'Analista fictício',exact:true}).click();await page.getByRole('button',{name:'Entrar na plataforma'}).click();await page.getByLabel('Buscar solicitações').fill(purpose);await page.getByRole('button',{name:'Abrir '+purpose,exact:true}).click();
 await page.getByLabel('Justificativa',{exact:true}).fill('Aprovada para demonstração após revisão dos dados financeiros sintéticos.');await page.getByRole('button',{name:'Confirmar decisão'}).click();await expect(page.getByText('Aprovada',{exact:true})).toBeVisible();await expect(page.getByText('Decisão do analista',{exact:true})).toBeVisible();await page.screenshot({path:'docs/screenshots/analyst-decision.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/screenshots/mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(external).toEqual([]);
});
