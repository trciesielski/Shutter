// Server-authorised uploads into R2 through the Pages binding (no R2 credentials leave the server).
// Large files are sent as fixed-size multipart chunks, each well below the Pages request body limit.
// Object keys are always generated here; the client only chooses the media kind and file extension.

export const PART_SIZE=8*1024*1024;
export const LIMITS=Object.freeze({audio:1024*1024*1024,cover:25*1024*1024});
export const SESSION_PREFIX='admin/uploads/';
const SESSION_TTL_MS=24*60*60*1000;
const MAX_PARTS=10000;

export const FORMATS=Object.freeze({
 audio:{
  mp3:{mime:['audio/mpeg','audio/mp3','audio/mpeg3','audio/x-mpeg-3',''],type:'audio/mpeg'},
  flac:{mime:['audio/flac','audio/x-flac',''],type:'audio/flac'},
  wav:{mime:['audio/wav','audio/x-wav','audio/wave','audio/vnd.wave',''],type:'audio/wav'},
  m4a:{mime:['audio/mp4','audio/x-m4a','audio/m4a','audio/aac',''],type:'audio/mp4'}
 },
 cover:{
  jpg:{mime:['image/jpeg'],type:'image/jpeg'},
  jpeg:{mime:['image/jpeg'],type:'image/jpeg'},
  png:{mime:['image/png'],type:'image/png'},
  webp:{mime:['image/webp'],type:'image/webp'}
 }
});

const ascii=(b,from,to)=>String.fromCharCode(...b.slice(from,to));
const M4A_BRANDS=new Set(['M4A ','M4B ','M4P ','mp41','mp42','isom','iso2','iso5','iso6','dash','MSNV','NDAS','3gp4','3gp5','3gp6','f4a ','f4v ','avc1']);

// Detects the real container format from the first bytes, independent of name and declared MIME.
export function sniffFormat(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(b.length>=3&&ascii(b,0,3)==='ID3')return 'mp3';
 if(b.length>=2&&b[0]===0xFF&&(b[1]&0xE0)===0xE0&&(b[1]&0x06)!==0)return 'mp3';
 if(b.length>=4&&ascii(b,0,4)==='fLaC')return 'flac';
 if(b.length>=12&&ascii(b,0,4)==='RIFF'&&ascii(b,8,12)==='WAVE')return 'wav';
 if(b.length>=12&&ascii(b,4,8)==='ftyp'&&M4A_BRANDS.has(ascii(b,8,12)))return 'm4a';
 if(b.length>=3&&b[0]===0xFF&&b[1]===0xD8&&b[2]===0xFF)return 'jpg';
 if(b.length>=8&&b[0]===0x89&&ascii(b,1,4)==='PNG'&&b[4]===0x0D&&b[5]===0x0A&&b[6]===0x1A&&b[7]===0x0A)return 'png';
 if(b.length>=12&&ascii(b,0,4)==='RIFF'&&ascii(b,8,12)==='WEBP')return 'webp';
 return null;
}
const sameFormat=(ext,sniffed)=>ext===sniffed||(ext==='jpeg'&&sniffed==='jpg');

export class UploadError extends Error{
 constructor(status,code,details={}){super(code);this.status=status;this.code=code;this.details=details}
}

const randomHex=bytes=>[...crypto.getRandomValues(new Uint8Array(bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
const SESSION_ID=/^[a-f0-9]{32}$/;

export function planUpload({kind,name,size,type}){
 if(kind!=='audio'&&kind!=='cover')throw new UploadError(400,'invalid_kind');
 if(typeof name!=='string'||!name||name.length>255)throw new UploadError(400,'invalid_name');
 const ext=/\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
 const format=ext&&FORMATS[kind][ext];
 if(!format)throw new UploadError(415,'unsupported_format');
 const declared=typeof type==='string'?type.trim().toLowerCase():'';
 if(!format.mime.includes(declared))throw new UploadError(415,'mime_mismatch');
 if(!Number.isSafeInteger(size)||size<=0)throw new UploadError(400,'invalid_size');
 if(size>LIMITS[kind])throw new UploadError(413,'file_too_large',{limit:LIMITS[kind]});
 const parts=Math.ceil(size/PART_SIZE);
 if(parts>MAX_PARTS)throw new UploadError(413,'file_too_large');
 const id=randomHex(8);
 const year=new Date().getUTCFullYear();
 const storedExt=ext==='jpeg'?'jpg':ext;
 const key=kind==='audio'?`tracks/${year}/${id}.${storedExt}`:`covers/${year}/${id}.${storedExt}`;
 return {kind,ext:storedExt,key,size,parts,contentType:format.type};
}

const sessionKey=sid=>SESSION_PREFIX+sid+'.json';

export async function startUpload(bucket,body,{actor,catalog}){
 const plan=planUpload(body||{});
 const fingerprint=typeof body.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(body.fingerprint)?body.fingerprint:null;
 if(plan.kind==='audio'&&fingerprint&&body.allowDuplicate!==true){
  const dup=(catalog?.tracks||[]).find(t=>t?.fingerprint===fingerprint);
  if(dup)throw new UploadError(409,'duplicate',{trackId:dup.id,title:typeof dup.title==='string'?dup.title:null});
 }
 const upload=await bucket.createMultipartUpload(plan.key,{httpMetadata:{contentType:plan.contentType,cacheControl:'public, max-age=86400'},customMetadata:{uploadedBy:actor||'',...(fingerprint?{fingerprint}:{})}});
 const sid=randomHex(16);
 const session={...plan,uploadId:upload.uploadId,fingerprint,actor:actor||'',created:Date.now()};
 await bucket.put(sessionKey(sid),JSON.stringify(session),{httpMetadata:{contentType:'application/json'}});
 return {session:sid,key:plan.key,partSize:PART_SIZE,parts:plan.parts};
}

async function loadSession(bucket,sid){
 if(typeof sid!=='string'||!SESSION_ID.test(sid))throw new UploadError(404,'upload_not_found');
 const obj=await bucket.get(sessionKey(sid));
 if(!obj)throw new UploadError(404,'upload_not_found');
 const s=JSON.parse(await obj.text());
 if(Date.now()-s.created>SESSION_TTL_MS){await abortSession(bucket,sid,s);throw new UploadError(410,'upload_expired')}
 return s;
}

async function abortSession(bucket,sid,s){
 try{await bucket.resumeMultipartUpload(s.key,s.uploadId).abort()}catch{}
 await bucket.delete(sessionKey(sid));
}

export async function uploadPart(bucket,sid,partNumber,request){
 const s=await loadSession(bucket,sid);
 const n=Number(partNumber);
 if(!Number.isInteger(n)||n<1||n>s.parts)throw new UploadError(400,'invalid_part');
 const expected=n<s.parts?PART_SIZE:s.size-(s.parts-1)*PART_SIZE;
 const declared=Number(request.headers.get('Content-Length'));
 if(Number.isFinite(declared)&&declared>0&&declared!==expected)throw new UploadError(400,'invalid_part_size',{expected});
 const bytes=new Uint8Array(await request.arrayBuffer());
 if(bytes.length!==expected)throw new UploadError(400,'invalid_part_size',{expected});
 if(n===1&&!sameFormat(s.ext,sniffFormat(bytes.subarray(0,64)))){await abortSession(bucket,sid,s);throw new UploadError(415,'signature_mismatch')}
 const part=await bucket.resumeMultipartUpload(s.key,s.uploadId).uploadPart(n,bytes);
 return {partNumber:part.partNumber,etag:part.etag};
}

export async function completeUpload(bucket,sid,body){
 const s=await loadSession(bucket,sid);
 const parts=Array.isArray(body?.parts)?body.parts:[];
 if(parts.length!==s.parts)throw new UploadError(400,'incomplete_upload');
 const sorted=[...parts].sort((a,b)=>a.partNumber-b.partNumber);
 sorted.forEach((p,i)=>{if(p?.partNumber!==i+1||typeof p.etag!=='string'||!p.etag||p.etag.length>200)throw new UploadError(400,'incomplete_upload')});
 try{await bucket.resumeMultipartUpload(s.key,s.uploadId).complete(sorted.map(p=>({partNumber:p.partNumber,etag:p.etag})))}
 catch{throw new UploadError(502,'complete_failed')}
 // Re-check the stored object, not the client's claims.
 const head=await bucket.head(s.key);
 const first=head?await bucket.get(s.key,{range:{offset:0,length:Math.min(64,head.size)}}):null;
 const sniffed=first?sniffFormat(new Uint8Array(await first.arrayBuffer())):null;
 if(!head||head.size!==s.size||!sameFormat(s.ext,sniffed)){
  await bucket.delete(s.key);await bucket.delete(sessionKey(sid));
  throw new UploadError(422,'verification_failed');
 }
 await bucket.delete(sessionKey(sid));
 return {key:s.key,size:s.size,kind:s.kind,contentType:s.contentType,fingerprint:s.fingerprint};
}

export async function cancelUpload(bucket,sid){
 const s=await loadSession(bucket,sid);
 await abortSession(bucket,sid,s);
 return {cancelled:true};
}
