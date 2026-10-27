// Read-only public access to selected prefixes of the R2 bucket bound as MUSIC_BUCKET.
// Only GET and HEAD are served; no list, write or delete operation is reachable.

export const DEFAULT_PUBLIC_PREFIXES=Object.freeze(['tracks/','covers/','catalog/']);
export const CONTENT_TYPES=Object.freeze({
 mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg',wav:'audio/wav',flac:'audio/flac',webm:'audio/webm',
 jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',avif:'image/avif',gif:'image/gif',
 json:'application/json; charset=utf-8'
});

const json=(status,body,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});

export function publicPrefixes(value){
 const list=String(value??'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>x.endsWith('/')?x:x+'/');
 return list.length?list:[...DEFAULT_PUBLIC_PREFIXES];
}

export function objectKey(path,prefixes=DEFAULT_PUBLIC_PREFIXES){
 const segments=Array.isArray(path)?path:String(path??'').split('/');
 if(!segments.length||segments.length>16)return null;
 for(const s of segments){
  if(typeof s!=='string'||!s||s==='.'||s==='..'||s.length>255||/[\u0000-\u001F\u007F\\]/.test(s))return null;
 }
 const key=segments.join('/');
 if(key.length>1024||!prefixes.some(p=>key.startsWith(p)))return null;
 const ext=/\.([a-z0-9]+)$/i.exec(key)?.[1]?.toLowerCase();
 if(!ext||!CONTENT_TYPES[ext])return null;
 return key;
}

export function parseRange(header,size){
 if(!header)return null;
 const m=/^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
 if(!m||(!m[1]&&!m[2]))return null; // malformed or multi-range: serve the full object
 if(size===0)return 'unsatisfiable';
 let start,end;
 if(!m[1]){const suffix=Number(m[2]);if(suffix===0)return 'unsatisfiable';start=Math.max(0,size-suffix);end=size-1}
 else{start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),size-1):size-1;if(m[2]&&Number(m[2])<start)return null}
 if(start>=size)return 'unsatisfiable';
 return {offset:start,length:end-start+1};
}

function baseHeaders(key,object){
 const ext=/\.([a-z0-9]+)$/i.exec(key)[1].toLowerCase();
 const headers=new Headers({
  'Content-Type':CONTENT_TYPES[ext],
  'Accept-Ranges':'bytes',
  'Cache-Control':key.startsWith('catalog/')?'no-cache':'public, max-age=86400',
  'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; sandbox",
  'Referrer-Policy':'no-referrer'
 });
 if(object.httpEtag)headers.set('ETag',object.httpEtag);
 if(object.uploaded instanceof Date)headers.set('Last-Modified',object.uploaded.toUTCString());
 return headers;
}

export async function handleMediaRequest({request,env={},params={}}){
 const method=request.method.toUpperCase();
 if(method!=='GET'&&method!=='HEAD')return json(405,{error:'method_not_allowed'},{Allow:'GET, HEAD'});
 const key=objectKey(params.path,publicPrefixes(env.MUSIC_PUBLIC_PREFIXES));
 if(!key)return json(404,{error:'not_found'});
 const bucket=env.MUSIC_BUCKET;
 if(!bucket||typeof bucket.head!=='function'||typeof bucket.get!=='function')return json(503,{error:'music_storage_not_configured'});
 const meta=await bucket.head(key);
 if(!meta)return json(404,{error:'not_found'});
 const headers=baseHeaders(key,meta);
 const etag=meta.httpEtag;
 if(etag&&request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers});
 const ifRange=request.headers.get('If-Range');
 const range=!ifRange||ifRange===etag?parseRange(request.headers.get('Range'),meta.size):null;
 if(range==='unsatisfiable'){headers.set('Content-Range',`bytes */${meta.size}`);return new Response(null,{status:416,headers})}
 if(range){
  headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${meta.size}`);
  headers.set('Content-Length',String(range.length));
  if(method==='HEAD')return new Response(null,{status:206,headers});
  const object=await bucket.get(key,{range});
  if(!object)return json(404,{error:'not_found'});
  return new Response(object.body,{status:206,headers});
 }
 headers.set('Content-Length',String(meta.size));
 if(method==='HEAD')return new Response(null,{status:200,headers});
 const object=await bucket.get(key);
 if(!object)return json(404,{error:'not_found'});
 return new Response(object.body,{status:200,headers});
}
