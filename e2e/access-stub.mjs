// Test-only Cloudflare Access stand-in for E2E: JWKS at /cdn-cgi/access/certs and a token minting
// endpoint at /token. Binds to 127.0.0.1 only; never used outside the local harness.
import {createServer} from 'node:http';

const port=Number(process.argv[2]||8790);
const issuer=`http://127.0.0.1:${port}`;
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const pub=await crypto.subtle.exportKey('jwk',pair.publicKey);
const jwks={keys:[{kty:'RSA',n:pub.n,e:pub.e,kid:'e2e-key',alg:'RS256',use:'sig'}]};
const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');

async function token({email='admin@example.com',aud='shutter-e2e-aud',ttl=3600}){
 const now=Math.floor(Date.now()/1000);
 const h=enc({alg:'RS256',kid:'e2e-key',typ:'JWT'}),p=enc({iss:issuer,aud:[aud],email,sub:'e2e',iat:now,nbf:now-5,exp:now+Number(ttl)});
 const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(h+'.'+p));
 return `${h}.${p}.${Buffer.from(sig).toString('base64url')}`;
}

createServer(async(req,res)=>{
 const url=new URL(req.url,issuer);
 if(url.pathname==='/cdn-cgi/access/certs'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(jwks));return}
 if(url.pathname==='/token'){res.writeHead(200,{'Content-Type':'text/plain'});res.end(await token(Object.fromEntries(url.searchParams)));return}
 res.writeHead(404);res.end();
}).listen(port,'127.0.0.1',()=>console.log('access stub on',issuer));
