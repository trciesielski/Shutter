import {test,expect} from '@playwright/test';
import {SITE,asAdmin,noHorizontalOverflow} from './helpers-admin.js';

test('admin layout is responsive and every control has an accessible name',async({page})=>{
 await asAdmin(page);
 await page.goto(SITE+'/admin/');
 await expect(page.getByRole('heading',{name:'Pulpit'})).toBeVisible();
 for(const [tab,heading] of [['Pulpit','Pulpit'],['Dodaj muzykę','Dodaj muzykę'],['Katalog',/^Katalog/],['Magazyn','Magazyn R2'],['Historia','Historia wersji']]){
  await page.getByRole('navigation',{name:'Sekcje panelu'}).getByRole('button',{name:tab}).click();
  await expect(page.getByRole('heading',{name:heading,level:1})).toBeVisible();
  expect(await noHorizontalOverflow(page),tab).toBe(true);
  const unnamed=await page.evaluate(()=>[...document.querySelectorAll('button,input:not([type=hidden]):not([hidden]),select,textarea')].filter(el=>el.offsetParent!==null&&!(el.getAttribute('aria-label')||el.labels?.[0]?.textContent?.trim()||el.textContent.trim()||el.getAttribute('placeholder'))).map(el=>el.outerHTML.slice(0,80)));
  expect(unnamed,tab).toEqual([]);
 }
 await page.getByRole('navigation',{name:'Sekcje panelu'}).getByRole('button',{name:'Katalog'}).click();
 await page.getByRole('button',{name:/^Edytuj: /}).first().click();
 const editor=page.getByRole('dialog');
 await expect(editor).toBeVisible();
 const box=await editor.boundingBox(),vp=page.viewportSize();
 expect(box.x).toBeGreaterThanOrEqual(-1);expect(box.x+box.width).toBeLessThanOrEqual(vp.width+1);
 await page.keyboard.press('Escape').catch(()=>{});
 await editor.getByRole('button',{name:'Zamknij edytor'}).click();
 await expect(editor).toHaveCount(0);
 await page.screenshot({path:`test-results/admin-${vp.width}.png`,fullPage:false});
});
