// Catalog administration: strict validation, optimistic-concurrency publishing, history and rollback.
import {objectKey} from './r2PublicMedia.js';
import {validateCatalog,CATALOG_VERSION,MAX_TRACKS,MAX_CATALOG_BYTES} from '../src/catalog/catalog.js';

export const CATALOG_KEY='catalog/catalog.json';
export const HISTORY_PREFIX='admin/catalog-history/';
export const HISTORY_LIMIT=100;
export const AUDIO_EXT=Object.freeze(['mp3','flac','wav','m4a']);
export const IMAGE_EXT=Object.freeze(['jpg','jpeg','png','webp']);
const ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const FINGERPRINT=/^[a-f0-9]{64}$/;
const CHECK_ORIGIN='https://catalog.invalid';

const ext=key=>/\.([a-z0-9]+)$/i.exec(key)?.[1]?.toLowerCase()||'';

export function cleanText(value,max){
 if(value===null||value===undefined)return '';
 if(typeof value!=='string'&&typeof value!=='number')return null;
 return String(value).normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g,'').replace(/[ \t]+/g,' ').trim().slice(0,max);
}

export function mediaKey(value,kind){
 if(typeof value!=='string')return null;
 const prefix=kind==='audio'?'tracks/':'covers/';
 const key=objectKey(value.split('/'),[prefix]);
 if(!key)return null;
 return (kind==='audio'?AUDIO_EXT:IMAGE_EXT).includes(ext(key))?key:null;
}

const intIn=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const numIn=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;

// Returns {catalog, errors}. `catalog` contains only known, normalised fields.
export function validateAdminCatalog(data){
 const errors=[];
 const err=(index,id,field,code)=>errors.push({index,id,field,code});
 if(!data||typeof data!=='object'||Array.isArray(data))return {catalog:null,errors:[{index:null,id:null,field:null,code:'invalid_catalog'}]};
 if(data.version!==CATALOG_VERSION)err(null,null,'version','unsupported_version');
 if(!Array.isArray(data.tracks))return {catalog:null,errors:[...errors,{index:null,id:null,field:'tracks',code:'missing_tracks'}]};
 if(data.tracks.length>MAX_TRACKS)err(null,null,'tracks','too_many_tracks');
 const title=cleanText(data.title,120);
 const seen=new Set(),tracks=[];
 data.tracks.slice(0,MAX_TRACKS).forEach((t,index)=>{
  if(!t||typeof t!=='object'||Array.isArray(t)){err(index,null,null,'invalid_entry');return}
  const id=typeof t.id==='string'?t.id.trim():'';
  if(!ID_PATTERN.test(id))err(index,id||null,'id','invalid_id');
  else if(seen.has(id))err(index,id,'id','duplicate_id');
  seen.add(id);
  const out={id};
  const text=(field,max,required)=>{
   const v=cleanText(t[field],max);
   if(v===null){err(index,id,field,'invalid_text');return}
   if(!v){if(required)err(index,id,field,'required');return}
   out[field]=v;
  };
  text('title',200,true);text('artist',200);text('album',200);text('albumArtist',200);text('genre',80);
  const audio=mediaKey(t.audio,'audio');
  if(!audio)err(index,id,'audio','invalid_audio_key');else out.audio=audio;
  if(t.cover!==undefined&&t.cover!==null&&t.cover!==''){const c=mediaKey(t.cover,'cover');if(!c)err(index,id,'cover','invalid_cover_key');else out.cover=c}
  if(t.thumbnail!==undefined&&t.thumbnail!==null&&t.thumbnail!==''){const c=mediaKey(t.thumbnail,'cover');if(!c)err(index,id,'thumbnail','invalid_cover_key');else out.thumbnail=c}
  if(t.mimeType!==undefined&&t.mimeType!==null&&t.mimeType!==''){if(typeof t.mimeType==='string'&&/^audio\/[a-z0-9.+-]+$/i.test(t.mimeType))out.mimeType=t.mimeType.toLowerCase();else err(index,id,'mimeType','invalid_mime')}
  const num=(field,check,code)=>{const v=t[field];if(v===undefined||v===null||v==='')return;if(check(v))out[field]=v;else err(index,id,field,code)};
  num('duration',v=>numIn(v,0.01,86400),'invalid_duration');
  num('year',v=>intIn(v,1000,2100),'invalid_year');
  num('trackNumber',v=>intIn(v,1,9999),'invalid_track_number');
  num('discNumber',v=>intIn(v,1,999),'invalid_disc_number');
  num('order',v=>numIn(v,-1e9,1e9),'invalid_order');
  num('size',v=>intIn(v,0,Number.MAX_SAFE_INTEGER),'invalid_size');
  if(t.lyrics!==undefined&&t.lyrics!==null&&t.lyrics!==''){
   if(typeof t.lyrics!=='string')err(index,id,'lyrics','invalid_text');
   else{const v=t.lyrics.replace(/\r\n?/g,'\n').normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim();if(v.length>20000)err(index,id,'lyrics','too_long');else if(v)out.lyrics=v}
  }
  if(t.fingerprint!==undefined&&t.fingerprint!==null&&t.fingerprint!==''){if(typeof t.fingerprint==='string'&&FINGERPRINT.test(t.fingerprint))out.fingerprint=t.fingerprint;else err(index,id,'fingerprint','invalid_fingerprint')}
  // shareUrl is part of the public catalog contract (exposed as publicUrl); validate it the same way
  // and carry it through so publishing never strips existing share links.
  if(t.shareUrl!==undefined&&t.shareUrl!==null&&t.shareUrl!==''){
   if(typeof t.shareUrl==='string'&&/^https:\/\//i.test(t.shareUrl)&&t.shareUrl.length<=2048)out.shareUrl=cleanText(t.shareUrl,2048);
   else err(index,id,'shareUrl','invalid_share_url');
  }
  if(t.addedAt!==undefined&&t.addedAt!==null){if(typeof t.addedAt==='string'&&!Number.isNaN(Date.parse(t.addedAt))&&t.addedAt.length<=40)out.addedAt=t.addedAt;else err(index,id,'addedAt','invalid_date')}
  if(t.metadata&&typeof t.metadata==='object'&&!Array.isArray(t.metadata)){
   const m={};for(const [k,v] of Object.entries(t.metadata).slice(0,20)){if(['__proto__','constructor','prototype'].includes(k)||k.length>40)continue;if(typeof v==='string')m[k]=cleanText(v,500);else if(typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v)))m[k]=v}
   if(Object.keys(m).length)out.metadata=m;
  }
  tracks.push(out);
 });
 const catalog={version:CATALOG_VERSION,...(title?{title}:{}),updatedAt:new Date().toISOString(),tracks};
 if(!errors.length){
  // The published file must be fully accepted by the public player's own validator.
  const pub=validateCatalog(catalog,{baseUrl:CHECK_ORIGIN+'/music/',allowedOrigins:[CHECK_ORIGIN]});
  for(const s of pub.skipped)err(s.position,s.id,null,'public_player_rejects:'+s.reason);
 }
 if(new TextEncoder().encode(JSON.stringify(catalog)).length>MAX_CATALOG_BYTES)err(null,null,null,'catalog_too_large');
 return {catalog,errors};
}

export function referencedKeys(catalog){
 const refs=new Map();
 for(const t of Array.isArray(catalog?.tracks)?catalog.tracks:[]){
  for(const field of ['audio','cover','thumbnail']){
   const k=typeof t?.[field]==='string'?t[field]:null;
   if(!k)continue;
   if(!refs.has(k))refs.set(k,[]);
   refs.get(k).push(t.id);
  }
 }
 return refs;
}

export async function readCatalog(bucket){
 const obj=await bucket.get(CATALOG_KEY);
 if(!obj)return {exists:false,etag:null,text:null,data:null,uploaded:null};
 const text=await obj.text();
 let data=null;try{data=JSON.parse(text)}catch{}
 return {exists:true,etag:obj.etag,text,data,uploaded:obj.uploaded instanceof Date?obj.uploaded.toISOString():null};
}

// While an object is being permanently deleted, `admin/deletion/<key>` exists. Any publish that
// references it is rejected, which closes the race between publishing a new reference and deleting
// the object (see deleteObject in adminApi.js).
export const DELETION_PREFIX='admin/deletion/';
export const tombstoneKey=key=>DELETION_PREFIX+key;

// Every referenced key must exist in R2 (a file can disappear independently of catalog edits) and
// must not be reserved by an in-flight permanent deletion.
async function missingObjects(bucket,catalog){
 const keys=[...referencedKeys(catalog).keys()];
 const missing=[],pending=[];
 for(let i=0;i<keys.length;i+=16){
  const slice=keys.slice(i,i+16);
  const heads=await Promise.all(slice.flatMap(k=>[bucket.head(k),bucket.head(tombstoneKey(k))]));
  slice.forEach((k,j)=>{if(!heads[j*2])missing.push(k);else if(heads[j*2+1])pending.push(k)});
 }
 return {missing,pending};
}

const randomHex=bytes=>[...crypto.getRandomValues(new Uint8Array(bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');

export class PublishError extends Error{
 constructor(status,code,details={}){super(code);this.status=status;this.code=code;this.details=details}
}

// Optimistic concurrency: the caller must present the ETag of the catalog it edited (or null when
// creating the first catalog). The current catalog is copied to history before it is replaced and
// the write itself is conditional on the ETag, so a concurrent publish can never be overwritten.
export async function publishCatalog(bucket,input,{ifMatch,actor,reason='publish'}){
 const {catalog,errors}=validateAdminCatalog(input);
 if(errors.length)throw new PublishError(422,'catalog_invalid',{errors});
 const current=await readCatalog(bucket);
 if(current.exists&&ifMatch!==current.etag)throw new PublishError(412,'catalog_conflict',{currentEtag:current.etag});
 if(!current.exists&&ifMatch)throw new PublishError(412,'catalog_conflict',{currentEtag:null});
 const {missing,pending}=await missingObjects(bucket,catalog);
 const missingErrors=[...missing.map(key=>({index:null,id:null,field:key,code:'object_missing'})),...pending.map(key=>({index:null,id:null,field:key,code:'object_pending_delete'}))];
 if(missingErrors.length)throw new PublishError(422,'catalog_invalid',{errors:missingErrors});
 let backupKey=null;
 if(current.exists){
  backupKey=`${HISTORY_PREFIX}${new Date().toISOString().replace(/[:.]/g,'-')}-${randomHex(4)}.json`;
  await bucket.put(backupKey,current.text,{httpMetadata:{contentType:'application/json; charset=utf-8'},customMetadata:{etag:current.etag,replacedBy:actor||'',reason}});
 }
 const body=JSON.stringify(catalog,null,1);
 const options={httpMetadata:{contentType:'application/json; charset=utf-8',cacheControl:'no-cache'},customMetadata:{publishedBy:actor||'',reason}};
 let written;
 try{
  // Both branches are atomic R2 conditional writes: etagMatches for replace, etagDoesNotMatch '*'
  // (If-None-Match semantics) for create-only. Two concurrent first publishes can never both win.
  if(current.exists)written=await bucket.put(CATALOG_KEY,body,{...options,onlyIf:{etagMatches:current.etag}});
  else written=await bucket.put(CATALOG_KEY,body,{...options,onlyIf:{etagDoesNotMatch:'*'}});
 }catch(error){
  if(error instanceof PublishError)throw error;
  throw new PublishError(502,'publish_failed',{backupKey});
 }
 if(!written){
  const now=await bucket.head(CATALOG_KEY);
  throw new PublishError(412,'catalog_conflict',{currentEtag:now?.etag??null});
 }
 await pruneHistory(bucket).catch(()=>{});
 return {etag:written.etag,catalog,backupKey};
}

export async function listHistory(bucket,limit=HISTORY_LIMIT){
 const items=[];let cursor;
 do{
  const page=await bucket.list({prefix:HISTORY_PREFIX,cursor,include:['customMetadata']});
  for(const o of page.objects)items.push({key:o.key,size:o.size,uploaded:o.uploaded instanceof Date?o.uploaded.toISOString():null,etag:o.customMetadata?.etag||null,replacedBy:o.customMetadata?.replacedBy||null,reason:o.customMetadata?.reason||null});
  cursor=page.truncated?page.cursor:undefined;
 }while(cursor&&items.length<5000);
 items.sort((a,b)=>b.key.localeCompare(a.key));
 return items.slice(0,limit);
}

async function pruneHistory(bucket){
 const all=await listHistory(bucket,5000);
 const old=all.slice(HISTORY_LIMIT).map(x=>x.key);
 if(old.length)await bucket.delete(old);
}

export async function rollbackCatalog(bucket,{versionKey,ifMatch,actor}){
 if(typeof versionKey!=='string'||!versionKey.startsWith(HISTORY_PREFIX)||!/^admin\/catalog-history\/[A-Za-z0-9._-]+\.json$/.test(versionKey))throw new PublishError(400,'invalid_version');
 const obj=await bucket.get(versionKey);
 if(!obj)throw new PublishError(404,'version_not_found');
 let data;try{data=JSON.parse(await obj.text())}catch{throw new PublishError(422,'catalog_invalid',{errors:[{code:'invalid_json'}]})}
 return publishCatalog(bucket,data,{ifMatch,actor,reason:'rollback:'+versionKey.slice(HISTORY_PREFIX.length)});
}
