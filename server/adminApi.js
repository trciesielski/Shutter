// /api/admin/* router. Authentication runs first for every request; nothing below is reachable without
// a valid Cloudflare Access JWT from an allow-listed administrator.
import {authenticateAdmin,checkSameOrigin,denied,jsonResponse} from './adminAuth.js';
import {readCatalog,publishCatalog,listHistory,rollbackCatalog,referencedKeys,validateAdminCatalog,PublishError,CATALOG_KEY,tombstoneKey} from './adminCatalog.js';
import {startUpload,uploadPart,completeUpload,cancelUpload,UploadError} from './adminUploads.js';
import {objectKey} from './r2PublicMedia.js';

const MEDIA_PREFIXES=['tracks/','covers/'];
const JSON_LIMIT=2_500_000;

async function readJson(request,limit=JSON_LIMIT){
 const type=request.headers.get('Content-Type')||'';
 if(!/^application\/json\b/i.test(type))throw new UploadError(415,'json_required');
 const declared=Number(request.headers.get('Content-Length'));
 if(Number.isFinite(declared)&&declared>limit)throw new UploadError(413,'body_too_large');
 const text=await request.text();
 if(text.length>limit)throw new UploadError(413,'body_too_large');
 try{return JSON.parse(text)}catch{throw new UploadError(400,'invalid_json')}
}

async function listMedia(bucket){
 const objects=[];
 for(const prefix of MEDIA_PREFIXES){
  let cursor;
  do{
   const page=await bucket.list({prefix,cursor,limit:1000});
   for(const o of page.objects)objects.push({key:o.key,size:o.size,uploaded:o.uploaded instanceof Date?o.uploaded.toISOString():null});
   cursor=page.truncated?page.cursor:undefined;
  }while(cursor&&objects.length<50000);
 }
 return objects;
}

async function storage(bucket){
 const [objects,current]=await Promise.all([listMedia(bucket),readCatalog(bucket)]);
 const refs=referencedKeys(current.data);
 const totals={tracks:{count:0,bytes:0},covers:{count:0,bytes:0}};
 for(const o of objects){const t=o.key.startsWith('tracks/')?totals.tracks:totals.covers;t.count++;t.bytes+=o.size;o.referencedBy=refs.get(o.key)||[]}
 objects.sort((a,b)=>String(b.uploaded).localeCompare(String(a.uploaded)));
 const present=new Set(objects.map(o=>o.key));
 const missing=[...refs.keys()].filter(k=>!present.has(k)).map(key=>({key,referencedBy:refs.get(key)}));
 return {totals,objects,missing};
}

// Permanent deletion is serialized against concurrent publishers by a tombstone at
// `admin/deletion/<key>` plus a conditional commit of the catalog:
//  1. create-only tombstone — after it exists, no publish can succeed referencing the key
//     (missingObjects checks it), and a second delete gets 409;
//  2. conditional put of the unchanged catalog on the etag we read — any publisher that checked
//     references before the tombstone must CAS the same etag, so either it commits first (our
//     commit fails, we abort) or we do (its CAS then fails);
//  3. only then the object is deleted, and the tombstone is removed.
// R2's ETag is a content hash: a byte-identical rewrite would leave the ETag unchanged and the CAS
// would not serialize anything, so step 2 refreshes only `updatedAt` (the public player ignores it,
// every other field is preserved verbatim). The rotation invalidates open drafts' ETags; the editor
// recovers by re-fetching and retrying when content (minus updatedAt) is identical (AdminApp.jsx).
// Residual: a first-ever catalog creation racing a delete cannot conflict on the etag (the key does
// not exist yet); the re-read in step 2 catches a catalog committed after we started.
async function deleteObject(bucket,body,actor){
 const key=typeof body?.key==='string'?objectKey(body.key.split('/'),MEDIA_PREFIXES):null;
 if(!key)throw new UploadError(400,'invalid_key');
 if(body.confirm!==key)throw new UploadError(400,'confirmation_required');
 const tombstone=tombstoneKey(key);
 const reserved=await bucket.put(tombstone,JSON.stringify({key,by:actor||'',at:new Date().toISOString()}),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
 if(!reserved)throw new UploadError(409,'delete_in_progress',{key});
 try{
  const current=await readCatalog(bucket);
  if(current.exists&&!current.data)throw new UploadError(409,'catalog_unreadable');
  const users=referencedKeys(current.data).get(key);
  if(users?.length)throw new UploadError(409,'object_referenced',{tracks:users});
  if(!await bucket.head(key))throw new UploadError(404,'not_found');
  if(current.exists){
   const pinned=await bucket.put(CATALOG_KEY,JSON.stringify({...current.data,updatedAt:new Date().toISOString()}),{onlyIf:{etagMatches:current.etag},httpMetadata:{contentType:'application/json; charset=utf-8',cacheControl:'no-cache'},customMetadata:current.customMetadata||{}});
   if(!pinned)throw new UploadError(409,'catalog_changed');
  }
  await bucket.delete(key);
  return {deleted:key};
 }finally{
  await bucket.delete(tombstone).catch(()=>{});
 }
}

export async function handleAdminApi({request,env={},params={}},options={}){
 let admin;
 try{admin=await authenticateAdmin(request,env,options)}catch(error){return denied(error)}
 if(!checkSameOrigin(request))return jsonResponse(403,{error:'csrf_rejected'});
 const bucket=env.MUSIC_BUCKET;
 if(!bucket||typeof bucket.put!=='function')return jsonResponse(503,{error:'music_storage_not_configured'});
 const path=(Array.isArray(params.path)?params.path:String(params.path||'').split('/')).filter(Boolean);
 const method=request.method.toUpperCase();
 const route=path.join('/');
 try{
  if(route==='session'&&method==='GET')return jsonResponse(200,{email:admin.email,expires:admin.exp});
  if(route==='catalog'&&method==='GET'){
   const c=await readCatalog(bucket);
   const validation=c.data?validateAdminCatalog(c.data).errors:(c.exists?[{code:'invalid_json'}]:[]);
   return jsonResponse(200,{exists:c.exists,etag:c.etag,updated:c.uploaded,catalog:c.data,validation});
  }
  if(route==='catalog'&&method==='PUT'){
   const body=await readJson(request);
   const result=await publishCatalog(bucket,body.catalog,{ifMatch:typeof body.etag==='string'?body.etag:null,actor:admin.email});
   return jsonResponse(200,{etag:result.etag,catalog:result.catalog,backupKey:result.backupKey,key:CATALOG_KEY});
  }
  if(route==='catalog/validate'&&method==='POST'){
   const body=await readJson(request);
   return jsonResponse(200,{errors:validateAdminCatalog(body.catalog).errors});
  }
  if(route==='catalog/history'&&method==='GET')return jsonResponse(200,{versions:await listHistory(bucket)});
  if(route==='catalog/rollback'&&method==='POST'){
   const body=await readJson(request);
   const result=await rollbackCatalog(bucket,{versionKey:body.version,ifMatch:typeof body.etag==='string'?body.etag:null,actor:admin.email});
   return jsonResponse(200,{etag:result.etag,catalog:result.catalog,backupKey:result.backupKey});
  }
  if(route==='storage'&&method==='GET')return jsonResponse(200,await storage(bucket));
  if(route==='objects'&&method==='DELETE')return jsonResponse(200,await deleteObject(bucket,await readJson(request),admin.email));
  if(route==='uploads'&&method==='POST'){
   const body=await readJson(request,10_000);
   const current=await readCatalog(bucket);
   return jsonResponse(201,await startUpload(bucket,body,{actor:admin.email,catalog:current.data}));
  }
  if(path[0]==='uploads'&&path.length===4&&path[2]==='parts'&&method==='PUT')return jsonResponse(200,await uploadPart(bucket,path[1],path[3],request,{actor:admin.email}));
  if(path[0]==='uploads'&&path.length===3&&path[2]==='complete'&&method==='POST')return jsonResponse(200,await completeUpload(bucket,path[1],await readJson(request,1_000_000),{actor:admin.email}));
  if(path[0]==='uploads'&&path.length===2&&method==='DELETE')return jsonResponse(200,await cancelUpload(bucket,path[1],{actor:admin.email}));
  return jsonResponse(404,{error:'not_found'});
 }catch(error){
  if(error instanceof UploadError||error instanceof PublishError)return jsonResponse(error.status,{error:error.code,...error.details});
  return jsonResponse(500,{error:'internal_error'});
 }
}
