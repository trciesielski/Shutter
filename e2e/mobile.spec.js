import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

// SHUTTER's decks are detached `new Audio()` elements, so track them from the prototype.
test.beforeEach(async({page})=>{await page.addInitScript(()=>{window.__decks=new Set();const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__decks.add(this);return play.call(this)}})});
async function goLibrary(page){
 const menu=page.getByRole('button',{name:'Otwórz menu'});
 if(await menu.isVisible())await menu.click();
 await page.getByRole('button',{name:/^Biblioteka/}).first().click();
}
test('mobile build keeps local import, playback and deletion',async({page})=>{
 await page.goto('/');
 await goLibrary(page);
 const input=page.locator('input[type=file]');
 await expect(input).toHaveCount(1);
 await input.setInputFiles({name:'local-tone.mp3',mimeType:'audio/mpeg',buffer:readFileSync('.wrangler/e2e/fixtures/a.mp3')});
 const play=page.getByRole('button',{name:/^Odtwórz utwór local-tone/}).first();
 await expect(play).toBeVisible();
 await play.click();
 await expect.poll(()=>page.evaluate(()=>[...(window.__decks||[])].some(a=>!a.paused&&a.currentSrc.startsWith('blob:')))).toBe(true);
 await page.getByRole('button',{name:/^Więcej akcji dla local-tone/}).first().click();
 await page.getByText('Usuń z biblioteki').click();
 await expect(play).toHaveCount(0);
});
