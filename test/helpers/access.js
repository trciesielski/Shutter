// Test-only Cloudflare Access stand-in: an RSA key pair, a JWKS document and a JWT signer.
const enc=s=>Buffer.from(typeof s==='string'?s:JSON.stringify(s)).toString('base64url');
export const TEAM='https://shutter-test.cloudflareaccess.com';
export const AUD='aud-shutter-admin-test';
export const ADMIN='admin@example.com';
export const env=(extra={})=>({ACCESS_TEAM_DOMAIN:TEAM,ACCESS_AUD:AUD,ADMIN_EMAILS:ADMIN,...extra});

export async function keyPair(kid='kid-1'){
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
 return {kid,privateKey:pair.privateKey,jwk:{kty:'RSA',n:jwk.n,e:jwk.e,kid,alg:'RS256',use:'sig'}};
}
export async function sign(key,claims={},header={}){
 const now=Math.floor(Date.now()/1000);
 const h=enc({alg:'RS256',kid:key.kid,typ:'JWT',...header});
 const p=enc({iss:TEAM,aud:[AUD],email:ADMIN,sub:'user-1',iat:now,nbf:now,exp:now+600,...claims});
 const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(h+'.'+p));
 return h+'.'+p+'.'+Buffer.from(sig).toString('base64url');
}
export function jwksFetch(...keys){
 const calls=[];
 const fn=async url=>{calls.push(String(url));return new Response(JSON.stringify({keys:keys.map(k=>k.jwk)}),{headers:{'Content-Type':'application/json'}})};
 fn.calls=calls;return fn;
}
