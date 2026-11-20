import {test,expect} from '@playwright/test';
test('tela real de acesso: identificação fictícia e layout móvel',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Bem-vindo ao campo.'})).toBeVisible();
 await expect(page.getByText('Ambiente demonstrativo — dados e análises fictícios',{exact:true})).toBeVisible();
 await page.screenshot({path:'docs/screenshots/login-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Analista fictício',exact:true}).click();await expect(page.getByLabel('E-mail',{exact:true})).toHaveValue('analista@agrolab.test');
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Entrar na plataforma'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'docs/screenshots/login-mobile.png',fullPage:true});expect(errors).toEqual([]);
});
