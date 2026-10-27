// Protects the static /admin/* pages: the HTML is only served after the Access JWT is verified.
import {authenticateAdmin,denied,securityHeaders} from './adminAuth.js';

export const ADMIN_CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export async function guardAdminPage({request,env={},next},options={}){
 try{await authenticateAdmin(request,env,options)}catch(error){return denied(error,{html:true})}
 const method=request.method.toUpperCase();
 if(method!=='GET'&&method!=='HEAD')return new Response(null,{status:405,headers:{Allow:'GET, HEAD',...securityHeaders}});
 const response=await next();
 const out=new Response(response.body,response);
 for(const [k,v] of Object.entries(securityHeaders))out.headers.set(k,v);
 out.headers.set('Content-Security-Policy',ADMIN_CSP);
 return out;
}
