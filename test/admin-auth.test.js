import test from 'node:test';
import assert from 'node:assert/strict';
import {accessConfig,verifyAccessJwt,clearJwksCache,checkSameOrigin,accessToken} from '../server/adminAuth.js';
import {handleAdminApi} from '../server/adminApi.js';
import {guardAdminPage} from '../server/adminPage.js';
import {keyPair,sign,jwksFetch,env,TEAM,AUD} from './helpers/access.js';

const key=await keyPair('k1'),other=await keyPair('k1');
const config=accessConfig(env());
const verify=(token,opts={})=>verifyAccessJwt(token,config,{fetchImpl:jwksFetch(key),...opts});
const rejects=async(p,status,code)=>{await assert.rejects(p,e=>e.status===status&&e.code===code,`${status} ${code}`)};
test.beforeEach(()=>clearJwksCache());

test('valid Access JWT for an allow-listed administrator is accepted',async()=>{
 const id=await verify(await sign(key));
 assert.equal(id.email,'admin@example.com');
});
test('signature, issuer, audience and algorithm are enforced',async()=>{
 await rejects(verify(await sign(other)),401,'invalid_signature');
 await rejects(verify(await sign(key,{iss:'https://evil.cloudflareaccess.com'})),401,'invalid_issuer');
 await rejects(verify(await sign(key,{aud:['other-app']})),401,'invalid_audience');
 const t=await sign(key);const [h,p]=t.split('.');
 const none=Buffer.from(JSON.stringify({alg:'none',kid:'k1'})).toString('base64url');
 await rejects(verify(`${none}.${p}.`),401,'invalid_algorithm');
 const tampered=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(p,'base64url')),email:'admin@example.com',exp:9e9})).toString('base64url');
 await rejects(verify(`${h}.${tampered}.${t.split('.')[2]}`),401,'invalid_signature');
 await rejects(verify('a.b'),401,'malformed_token');
 await rejects(verify(''),401,'missing_token');
});
test('expired and not-yet-valid tokens are rejected',async()=>{
 const now=Math.floor(Date.now()/1000);
 await rejects(verify(await sign(key,{exp:now-120})),401,'token_expired');
 await rejects(verify(await sign(key,{exp:undefined})),401,'token_expired');
 await rejects(verify(await sign(key,{nbf:now+600,exp:now+1200})),401,'token_not_yet_valid');
});
test('identity must be on the explicit allowlist',async()=>{
 await rejects(verify(await sign(key,{email:'someone@example.com'})),403,'not_an_administrator');
 await rejects(verify(await sign(key,{email:undefined})),403,'identity_missing');
 const id=await verify(await sign(key,{email:'ADMIN@Example.com'}));assert.equal(id.email,'admin@example.com');
});
test('missing or invalid Access configuration fails closed',async()=>{
 assert.equal(accessConfig({}),null);
 assert.equal(accessConfig(env({ACCESS_AUD:''})),null);
 assert.equal(accessConfig(env({ADMIN_EMAILS:' , '})),null);
 assert.equal(accessConfig(env({ACCESS_TEAM_DOMAIN:'http://shutter.cloudflareaccess.com'})),null,'plain http only for loopback');
 assert.equal(accessConfig(env({ACCESS_TEAM_DOMAIN:'https://x.cloudflareaccess.com/path'})),null);
 assert.ok(accessConfig(env({ACCESS_TEAM_DOMAIN:'http://127.0.0.1:9999'})));
 await rejects(verifyAccessJwt(await sign(key),null),503,'admin_not_configured');
 const token=await sign(key);
 const res=await handleAdminApi({request:new Request('https://x.test/api/admin/session',{headers:{'Cf-Access-Jwt-Assertion':token}}),env:{MUSIC_BUCKET:{put(){}}},params:{path:['session']}},{fetchImpl:jwksFetch(key)});
 assert.equal(res.status,503);assert.deepEqual(await res.json(),{error:'admin_not_configured'});
});
test('JWKS is cached; unknown key ids cannot force refetch storms',async()=>{
 const f=jwksFetch(key);
 await verify(await sign(key),{fetchImpl:f});await verify(await sign(key),{fetchImpl:f});
 assert.equal(f.calls.length,1);assert.equal(f.calls[0],TEAM+'/cdn-cgi/access/certs');
 const rotated=await keyPair('k2');
 await assert.rejects(verify(await sign(rotated),{fetchImpl:f}),e=>e.code==='unknown_key');
 assert.equal(f.calls.length,1,'forced refresh is rate-limited to once per 30 s');
 clearJwksCache();
 const g=jwksFetch(key,rotated);
 assert.equal((await verify(await sign(rotated),{fetchImpl:g})).email,'admin@example.com');
});
test('unreachable JWKS fails closed with 503',async()=>{
 await rejects(verify(await sign(key),{fetchImpl:async()=>{throw new Error('down')}}),503,'access_keys_unavailable');
 await rejects(verify(await sign(key),{fetchImpl:async()=>new Response('x',{status:500})}),503,'access_keys_unavailable');
});
test('token is read from the Access header or CF_Authorization cookie',()=>{
 assert.equal(accessToken(new Request('https://x.test',{headers:{'Cf-Access-Jwt-Assertion':'a.b.c'}})),'a.b.c');
 assert.equal(accessToken(new Request('https://x.test',{headers:{Cookie:'x=1; CF_Authorization=d.e.f'}})),'d.e.f');
 assert.equal(accessToken(new Request('https://x.test')),'');
});
test('state-changing requests require same Origin and the admin header (CSRF)',()=>{
 const r=(h,m='POST')=>new Request('https://music.test/api/admin/catalog',{method:m,headers:h});
 assert.equal(checkSameOrigin(r({},'GET')),true);
 assert.equal(checkSameOrigin(r({'X-Shutter-Admin':'1',Origin:'https://music.test'})),true);
 assert.equal(checkSameOrigin(r({Origin:'https://music.test'})),false);
 assert.equal(checkSameOrigin(r({'X-Shutter-Admin':'1',Origin:'https://evil.test'})),false);
 assert.equal(checkSameOrigin(r({'X-Shutter-Admin':'1'})),false);
});
test('every admin API route rejects requests without a valid token',async()=>{
 const bucket=new Proxy({},{get:()=>()=>{throw new Error('storage must not be touched')}});
 const routes=[['GET','session'],['GET','catalog'],['PUT','catalog'],['GET','catalog/history'],['POST','catalog/rollback'],['GET','storage'],['DELETE','objects'],['POST','uploads'],['PUT','uploads/0123456789abcdef0123456789abcdef/parts/1'],['POST','uploads/0123456789abcdef0123456789abcdef/complete'],['DELETE','uploads/0123456789abcdef0123456789abcdef'],['GET','nope']];
 const bad=await sign(other),expired=await sign(key,{exp:Math.floor(Date.now()/1000)-300}),stranger=await sign(key,{email:'x@example.com'});
 for(const [method,path] of routes){
  for(const [token,status] of [[null,401],[bad,401],[expired,401],[stranger,403]]){
   const headers={'X-Shutter-Admin':'1',Origin:'https://x.test','Content-Type':'application/json'};
   if(token)headers['Cf-Access-Jwt-Assertion']=token;
   const res=await handleAdminApi({request:new Request('https://x.test/api/admin/'+path,{method,headers,body:method==='GET'?undefined:'{}'}),env:{...env(),MUSIC_BUCKET:bucket},params:{path:path.split('/')}},{fetchImpl:jwksFetch(key)});
   assert.equal(res.status,status,`${method} ${path}`);
   assert.equal(res.headers.get('Cache-Control'),'no-store');
  }
 }
});
test('/admin page is not served without a valid token and is served with one',async()=>{
 let served=0;
 const next=async()=>{served++;return new Response('<html>admin</html>',{headers:{'Content-Type':'text/html'}})};
 const ctx=headers=>({request:new Request('https://x.test/admin/',{headers}),env:env(),next});
 const denied=await guardAdminPage(ctx({}),{fetchImpl:jwksFetch(key)});
 assert.equal(denied.status,401);assert.equal(served,0);
 assert.doesNotMatch(await denied.text(),/admin<\/html>/);
 const forbidden=await guardAdminPage(ctx({'Cf-Access-Jwt-Assertion':await sign(key,{email:'x@example.com'})}),{fetchImpl:jwksFetch(key)});
 assert.equal(forbidden.status,403);assert.equal(served,0);
 const notConfigured=await guardAdminPage({...ctx({'Cf-Access-Jwt-Assertion':await sign(key)}),env:{}},{fetchImpl:jwksFetch(key)});
 assert.equal(notConfigured.status,503);assert.equal(served,0);
 const ok=await guardAdminPage(ctx({'Cf-Access-Jwt-Assertion':await sign(key)}),{fetchImpl:jwksFetch(key)});
 assert.equal(ok.status,200);assert.equal(served,1);
 assert.match(ok.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
 assert.equal(ok.headers.get('Cache-Control'),'no-store');
 assert.equal(AUD.length>0,true);
});
