// Chunked, resumable upload through /api/admin/uploads (server-generated keys, server-side validation).
import {api,ApiError,API_BASE} from './api.js';

const RETRIES=3;
const retryable=e=>e instanceof ApiError&&(e.status===0||e.status===408||e.status===429||e.status>=500);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function putPart(url,blob,onProgress,signal){
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('PUT',url);
  xhr.setRequestHeader('X-Shutter-Admin','1');
  xhr.setRequestHeader('Content-Type','application/octet-stream');
  xhr.responseType='json';
  xhr.upload.onprogress=e=>onProgress(e.loaded);
  xhr.onload=()=>{const body=xhr.response||{};xhr.status>=200&&xhr.status<300?resolve(body):reject(new ApiError(xhr.status,body.error||'http_'+xhr.status,body))};
  xhr.onerror=()=>reject(new ApiError(0,'network_error'));
  xhr.onabort=()=>reject(new DOMException('Aborted','AbortError'));
  signal?.addEventListener('abort',()=>xhr.abort(),{once:true});
  xhr.send(blob);
 });
}

export async function fingerprint(file){
 const edge=2*1024*1024;
 const head=await file.slice(0,edge).arrayBuffer();
 const tail=file.size>edge?await file.slice(Math.max(edge,file.size-edge)).arrayBuffer():new ArrayBuffer(0);
 const sizeBytes=new TextEncoder().encode(String(file.size)+':');
 const all=new Uint8Array(sizeBytes.length+head.byteLength+tail.byteLength);
 all.set(sizeBytes,0);all.set(new Uint8Array(head),sizeBytes.length);all.set(new Uint8Array(tail),sizeBytes.length+head.byteLength);
 const digest=await crypto.subtle.digest('SHA-256',all);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

// `state` persists between attempts so a retry resumes with the parts that are already stored.
export async function uploadFile(file,{kind,name,fingerprint:fp,allowDuplicate=false,onProgress=()=>{},signal,state={}}){
 if(!state.session){
  const started=await api('uploads',{method:'POST',body:{kind,name:name||file.name,size:file.size,type:file.type||'',fingerprint:fp,allowDuplicate},signal});
  Object.assign(state,started,{done:{}});
 }
 const {session,partSize,parts}=state;
 const loaded=new Array(parts).fill(0);
 for(const n of Object.keys(state.done))loaded[n-1]=Math.min(partSize,file.size-(n-1)*partSize);
 const report=()=>onProgress(Math.min(1,loaded.reduce((a,b)=>a+b,0)/file.size));
 report();
 for(let n=1;n<=parts;n++){
  if(state.done[n])continue;
  const blob=file.slice((n-1)*partSize,Math.min(file.size,n*partSize));
  for(let attempt=0;;attempt++){
   try{
    const part=await putPart(`${API_BASE}uploads/${session}/parts/${n}`,blob,x=>{loaded[n-1]=x;report()},signal);
    state.done[n]=part.etag;loaded[n-1]=blob.size;report();break;
   }catch(error){
    if(error?.name==='AbortError'||!retryable(error)||attempt>=RETRIES-1){loaded[n-1]=0;report();throw error}
    await sleep(800*2**attempt);
   }
  }
 }
 const result=await api(`uploads/${session}/complete`,{method:'POST',body:{parts:Object.entries(state.done).map(([n,etag])=>({partNumber:Number(n),etag}))},signal});
 state.result=result;
 return result;
}

export async function cancelUpload(state){
 if(state?.session&&!state.result){try{await api(`uploads/${state.session}`,{method:'DELETE'})}catch{}}
}
