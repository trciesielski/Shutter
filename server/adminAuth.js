// Cloudflare Access authentication for SHUTTER ADMIN.
// Every admin request is verified here on the server: RS256 signature against the team JWKS,
// issuer, audience, expiry/not-before and an explicit e-mail allowlist. Missing config fails closed.

const JWKS_TTL_MS=10*60*1000;
const MIN_REFRESH_MS=30*1000;
const CLOCK_SKEW_S=60;
const jwksCache=new Map();

export class AccessError extends Error{
 constructor(status,code){super(code);this.name='AccessError';this.status=status;this.code=code}
}

const list=value=>String(value??'').split(',').map(x=>x.trim()).filter(Boolean);
const isLocalHost=host=>host==='localhost'||host==='127.0.0.1'||host==='[::1]';

export function accessConfig(env={}){
 let team;
 try{team=new URL(String(env.ACCESS_TEAM_DOMAIN??'').trim())}catch{return null}
 if(team.username||team.password||team.search||team.hash||(team.pathname!=='/'&&team.pathname!==''))return null;
 // Plain http is accepted only for a loopback JWKS used by the local test harness.
 if(team.protocol!=='https:'&&!(team.protocol==='http:'&&isLocalHost(team.hostname)))return null;
 const audiences=list(env.ACCESS_AUD);
 const emails=list(env.ADMIN_EMAILS).map(x=>x.toLowerCase()).filter(x=>/^[^@\s]+@[^@\s]+$/.test(x));
 if(!audiences.length||!emails.length)return null;
 return Object.freeze({issuer:team.origin,certsUrl:team.origin+'/cdn-cgi/access/certs',audiences,emails});
}

function b64urlBytes(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]*$/.test(value))throw new AccessError(401,'malformed_token');
 const b64=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);
 const bin=atob(b64);const out=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
 return out;
}
const b64urlJson=value=>{try{return JSON.parse(new TextDecoder().decode(b64urlBytes(value)))}catch(e){if(e instanceof AccessError)throw e;throw new AccessError(401,'malformed_token')}};

async function fetchJwks(config,fetchImpl,force){
 const cached=jwksCache.get(config.certsUrl);
 const now=Date.now();
 if(cached&&(!force?now<cached.expires:now-cached.fetched<MIN_REFRESH_MS))return cached.keys;
 let res;
 try{res=await fetchImpl(config.certsUrl,{headers:{Accept:'application/json'}})}catch{throw new AccessError(503,'access_keys_unavailable')}
 if(!res.ok)throw new AccessError(503,'access_keys_unavailable');
 let body;try{body=await res.json()}catch{throw new AccessError(503,'access_keys_unavailable')}
 const keys=new Map();
 for(const jwk of Array.isArray(body?.keys)?body.keys:[]){
  if(jwk?.kty!=='RSA'||typeof jwk.kid!=='string'||(jwk.alg&&jwk.alg!=='RS256')||(jwk.use&&jwk.use!=='sig'))continue;
  try{keys.set(jwk.kid,await crypto.subtle.importKey('jwk',{kty:'RSA',n:jwk.n,e:jwk.e,alg:'RS256',ext:true},{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']))}catch{}
 }
 if(!keys.size)throw new AccessError(503,'access_keys_unavailable');
 jwksCache.set(config.certsUrl,{keys,fetched:now,expires:now+JWKS_TTL_MS});
 return keys;
}

export function clearJwksCache(){jwksCache.clear()}

export async function verifyAccessJwt(token,config,{fetchImpl=globalThis.fetch,now=Date.now()}={}){
 if(!config)throw new AccessError(503,'admin_not_configured');
 if(typeof token!=='string'||!token||token.length>16384)throw new AccessError(401,'missing_token');
 const parts=token.split('.');
 if(parts.length!==3)throw new AccessError(401,'malformed_token');
 const header=b64urlJson(parts[0]),payload=b64urlJson(parts[1]),signature=b64urlBytes(parts[2]);
 if(header?.alg!=='RS256'||typeof header.kid!=='string')throw new AccessError(401,'invalid_algorithm');
 let keys=await fetchJwks(config,fetchImpl,false);
 if(!keys.has(header.kid))keys=await fetchJwks(config,fetchImpl,true);
 const key=keys.get(header.kid);
 if(!key)throw new AccessError(401,'unknown_key');
 const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,new TextEncoder().encode(parts[0]+'.'+parts[1]));
 if(!valid)throw new AccessError(401,'invalid_signature');
 if(!payload||typeof payload!=='object')throw new AccessError(401,'malformed_token');
 const seconds=Math.floor(now/1000);
 if(payload.iss!==config.issuer)throw new AccessError(401,'invalid_issuer');
 const aud=Array.isArray(payload.aud)?payload.aud:[payload.aud];
 if(!aud.some(a=>typeof a==='string'&&config.audiences.includes(a)))throw new AccessError(401,'invalid_audience');
 if(typeof payload.exp!=='number'||payload.exp+CLOCK_SKEW_S<=seconds)throw new AccessError(401,'token_expired');
 if(typeof payload.nbf==='number'&&payload.nbf-CLOCK_SKEW_S>seconds)throw new AccessError(401,'token_not_yet_valid');
 if(typeof payload.iat==='number'&&payload.iat-CLOCK_SKEW_S>seconds)throw new AccessError(401,'token_not_yet_valid');
 const email=typeof payload.email==='string'?payload.email.trim().toLowerCase():'';
 if(!email)throw new AccessError(403,'identity_missing');
 if(!config.emails.includes(email))throw new AccessError(403,'not_an_administrator');
 return Object.freeze({email,sub:typeof payload.sub==='string'?payload.sub:null,exp:payload.exp});
}

export function accessToken(request){
 const header=request.headers.get('Cf-Access-Jwt-Assertion');
 if(header)return header.trim();
 const cookie=request.headers.get('Cookie')||'';
 const match=/(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
 return match?match[1].trim():'';
}

// State-changing calls must come from the admin page itself: a custom header forces a CORS preflight
// for cross-site callers and the Origin must match exactly.
export function checkSameOrigin(request){
 const method=request.method.toUpperCase();
 if(method==='GET'||method==='HEAD')return true;
 const origin=request.headers.get('Origin');
 return request.headers.get('X-Shutter-Admin')==='1'&&!!origin&&origin===new URL(request.url).origin;
}

export const securityHeaders=Object.freeze({
 'Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY',
 'Referrer-Policy':'no-referrer',
 'X-Robots-Tag':'noindex, nofollow'
});

export function jsonResponse(status,body,extra={}){
 return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8',...securityHeaders,...extra}});
}

export async function authenticateAdmin(request,env,options={}){
 const config=accessConfig(env);
 if(!config)throw new AccessError(503,'admin_not_configured');
 return verifyAccessJwt(accessToken(request),config,options);
}

export function denied(error,{html=false}={}){
 const status=error instanceof AccessError?error.status:500;
 const code=error instanceof AccessError?error.code:'auth_failure';
 if(!html)return jsonResponse(status,{error:code});
 const text=status===503?'Panel administracyjny nie jest skonfigurowany.':status===403?'Brak uprawnień administratora.':'Wymagane logowanie przez Cloudflare Access.';
 return new Response(`<!doctype html><html lang="pl"><meta charset="utf-8"><title>SHUTTER ADMIN</title><body style="background:#0a0c13;color:#f7f7ff;font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0"><main><h1 style="font-size:20px">${text}</h1><p style="color:#8f92a5">Kod: ${code}</p></main></body></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8',...securityHeaders}});
}
