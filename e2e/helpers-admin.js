export const SITE='http://127.0.0.1:8788';
const STUB='http://127.0.0.1:8790';
export const tokenFor=async(params={})=>(await fetch(STUB+'/token?'+new URLSearchParams(params))).text();
// Cloudflare Access injects Cf-Access-Jwt-Assertion at the edge; here it is added to same-origin requests only.
export async function asAdmin(page,params={}){
 const token=await tokenFor(params);
 await page.route(SITE+'/**',route=>route.continue({headers:{...route.request().headers(),'cf-access-jwt-assertion':token}}));
 return token;
}
export const apiHeaders=token=>({'cf-access-jwt-assertion':token,'x-shutter-admin':'1',origin:SITE,'content-type':'application/json'});
export const noHorizontalOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1);
