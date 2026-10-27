// Public, read-only music catalog: configuration, validation and loading.
// Catalog content is untrusted data: it is normalised to plain strings/numbers and only
// http(s) URLs from explicitly allowed origins are accepted for audio and artwork.

export const CATALOG_VERSION=1;
export const MAX_TRACKS=5000;
export const MAX_CATALOG_BYTES=2_000_000;
export const DEFAULT_TIMEOUT_MS=15000;
export const DEFAULT_MUSIC_BASE='/music/';

export const AUDIO_TYPES=Object.freeze({mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg; codecs=opus',wav:'audio/wav',flac:'audio/flac',webm:'audio/webm'});
const IMAGE_EXT=/\.(jpe?g|png|webp|avif|gif)$/i;
const ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const BLOCKED_KEYS=new Set(['__proto__','constructor','prototype']);
const ARTS=['night','violet','blue','ocean'];

const withSlash=value=>value.endsWith('/')?value:value+'/';

export function resolveCatalogConfig(env={},origin=globalThis.location?.origin||'http://localhost'){
 const base=new URL(withSlash(String(env.VITE_MUSIC_BASE_URL||'').trim()||DEFAULT_MUSIC_BASE),origin);
 const catalogUrl=new URL(String(env.VITE_CATALOG_URL||'').trim()||'catalog/catalog.json',base);
 const extra=String(env.VITE_MUSIC_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>{try{return new URL(x).origin}catch{return null}}).filter(Boolean);
 return {baseUrl:base.toString(),catalogUrl:catalogUrl.toString(),allowedOrigins:[...new Set([base.origin,catalogUrl.origin,...extra])]};
}

function cleanText(value,max){
 if(typeof value!=='string'&&typeof value!=='number')return '';
 // Strip control characters (incl. bidi overrides) and collapse whitespace; rendered as text only.
 return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g,'').replace(/[ \t]+/g,' ').trim().slice(0,max);
}

const isLocalHost=host=>host==='localhost'||host==='127.0.0.1'||host==='[::1]';

export function resolveAssetUrl(value,{baseUrl,allowedOrigins}){
 if(typeof value!=='string'||!value.trim()||value.length>2048)return null;
 let url;
 try{url=new URL(value.trim(),baseUrl)}catch{return null}
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&isLocalHost(url.hostname)))return null;
 if(url.username||url.password)return null;
 if(!allowedOrigins.includes(url.origin))return null;
 return url.toString();
}

export function audioTypeFor(url,declared){
 if(typeof declared==='string'&&/^audio\/[a-z0-9.+-]+(;.*)?$/i.test(declared.trim()))return declared.trim().toLowerCase();
 const ext=/\.([a-z0-9]+)$/i.exec(new URL(url).pathname)?.[1]?.toLowerCase();
 return ext?AUDIO_TYPES[ext]||null:null;
}

function cleanMetadata(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const out={};
 for(const [key,raw] of Object.entries(value).slice(0,20)){
  if(BLOCKED_KEYS.has(key)||key.length>40)continue;
  if(typeof raw==='string')out[key]=cleanText(raw,500);
  else if(typeof raw==='number'&&Number.isFinite(raw))out[key]=raw;
  else if(typeof raw==='boolean')out[key]=raw;
 }
 return out;
}

const finiteNumber=(value,min,max)=>{const n=typeof value==='string'&&value.trim()?Number(value):value;return typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max?n:null};

export function validateCatalog(data,{baseUrl,allowedOrigins,canPlay=()=>true}){
 if(!data||typeof data!=='object'||Array.isArray(data))throw new CatalogError('invalid','Katalog muzyki ma nieprawidłowy format.');
 if(data.version!==CATALOG_VERSION)throw new CatalogError('invalid','Nieobsługiwana wersja katalogu muzyki.');
 if(!Array.isArray(data.tracks))throw new CatalogError('invalid','Katalog muzyki nie zawiera listy utworów.');
 const tracks=[],skipped=[],seen=new Set();
 data.tracks.slice(0,MAX_TRACKS).forEach((entry,position)=>{
  const skip=reason=>skipped.push({position,id:typeof entry?.id==='string'?entry.id.slice(0,128):null,reason});
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return skip('invalid-entry');
  const id=typeof entry.id==='string'?entry.id.trim():'';
  if(!ID_PATTERN.test(id))return skip('invalid-id');
  if(seen.has(id))return skip('duplicate-id');
  const title=cleanText(entry.title,200);
  if(!title)return skip('missing-title');
  const url=resolveAssetUrl(entry.audio,{baseUrl,allowedOrigins});
  if(!url)return skip('invalid-audio-url');
  const type=audioTypeFor(url,entry.mimeType);
  if(!type)return skip('unknown-audio-format');
  if(!canPlay(type))return skip('unsupported-audio-format');
  seen.add(id);
  const order=finiteNumber(entry.order,-1e9,1e9);
  tracks.push({
   id,title,
   artist:cleanText(entry.artist,200)||'Nieznany wykonawca',
   album:cleanText(entry.album,200)||'Nieznany album',
   url,mimeType:type,
   coverUrl:IMAGE_EXT.test(String(entry.cover||'').split(/[?#]/)[0])?resolveAssetUrl(entry.cover,{baseUrl,allowedOrigins}):null,
   duration:finiteNumber(entry.duration,0.01,86400),
   genre:cleanText(entry.genre,80)||null,
   year:Number.isInteger(finiteNumber(entry.year,1000,2100))?finiteNumber(entry.year,1000,2100):null,
   order,
   lyrics:typeof entry.lyrics==='string'?cleanText(entry.lyrics.replace(/\r\n?/g,'\n'),20000)||null:null,
   metadata:cleanMetadata(entry.metadata),
   publicUrl:typeof entry.shareUrl==='string'&&/^https:\/\//i.test(entry.shareUrl)?cleanText(entry.shareUrl,2048):undefined,
   source:'catalog',
   position
  });
 });
 if(data.tracks.length>MAX_TRACKS)skipped.push({position:MAX_TRACKS,id:null,reason:'too-many-tracks'});
 tracks.sort((a,b)=>(a.order??Infinity)-(b.order??Infinity)||a.position-b.position);
 tracks.forEach((t,i)=>{t.art=ARTS[i%ARTS.length];delete t.position});
 return {title:cleanText(data.title,120)||null,tracks,skipped};
}

export class CatalogError extends Error{
 constructor(code,message,status){super(message);this.name='CatalogError';this.code=code;this.status=status}
}

export async function loadCatalog({catalogUrl,baseUrl,allowedOrigins,canPlay,fetchImpl=globalThis.fetch,timeoutMs=DEFAULT_TIMEOUT_MS,maxBytes=MAX_CATALOG_BYTES}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  let response;
  try{response=await fetchImpl(catalogUrl,{method:'GET',credentials:'omit',cache:'no-cache',headers:{Accept:'application/json'},signal:controller.signal})}
  catch(error){
   if(controller.signal.aborted)return failure(new CatalogError('timeout','Przekroczono czas wczytywania katalogu muzyki. Sprawdź połączenie i spróbuj ponownie.'));
   return failure(new CatalogError('network','Nie można połączyć się z katalogiem muzyki.'));
  }
  if(!response.ok)return failure(new CatalogError('http',`Katalog muzyki jest niedostępny (HTTP ${response.status}).`,response.status));
  const declared=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(declared)&&declared>maxBytes)return failure(new CatalogError('too-large','Katalog muzyki jest zbyt duży.'));
  let text;
  try{text=await response.text()}catch{return failure(new CatalogError(controller.signal.aborted?'timeout':'network','Nie można pobrać katalogu muzyki.'))}
  if(text.length>maxBytes)return failure(new CatalogError('too-large','Katalog muzyki jest zbyt duży.'));
  let data;
  try{data=JSON.parse(text)}catch{return failure(new CatalogError('invalid','Katalog muzyki ma nieprawidłowy format.'))}
  try{
   const result=validateCatalog(data,{baseUrl,allowedOrigins,canPlay});
   return {status:result.tracks.length?'ready':'empty',...result,error:null};
  }catch(error){return failure(error instanceof CatalogError?error:new CatalogError('invalid','Katalog muzyki ma nieprawidłowy format.'))}
 }finally{clearTimeout(timer)}
}

function failure(error){return {status:'error',title:null,tracks:[],skipped:[],error:{code:error.code,message:error.message,status:error.status??null}}}

export function browserCanPlay(type){
 try{return typeof Audio!=='undefined'&&new Audio().canPlayType(type)!==''}catch{return false}
}
