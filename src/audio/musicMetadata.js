// Metadata extraction without uploading files. ID3v2 and FLAC Vorbis comments.
const decoder=new TextDecoder('utf-8');
const synchsafe=a=>(a[0]*2097152+a[1]*16384+a[2]*128+a[3]);
const be32=(v,o)=>((v[o]*16777216)+(v[o+1]<<16)+(v[o+2]<<8)+v[o+3])>>>0;
const safe=(s)=>s?.replace(/\0/g,'').trim()||'';
function textFrame(data){if(!data.length)return '';let enc=data[0],bytes=data.slice(1);try{if(enc===1||enc===2){const little=enc===1&&bytes[0]===255&&bytes[1]===254;const offset=enc===1&&((bytes[0]===255&&bytes[1]===254)||(bytes[0]===254&&bytes[1]===255))?2:0;let b=bytes.slice(offset);if(!little){const swapped=new Uint8Array(b.length);for(let i=0;i+1<b.length;i+=2){swapped[i]=b[i+1];swapped[i+1]=b[i]}b=swapped}return safe(new TextDecoder('utf-16le').decode(b))}return safe(new TextDecoder(enc===0?'windows-1252':'utf-8').decode(bytes))}catch{return ''}}
function picture(bytes){if(!bytes?.length)return null;try{return new Blob([bytes],{type:'image/jpeg'})}catch{return null}}
function parseID3(v){
 if(v.length<10||String.fromCharCode(...v.slice(0,3))!=='ID3')return {};
 const version=v[3],size=Math.min(v.length,10+synchsafe(v.slice(6,10)));let at=10,out={};
 while(at+10<=size){let id=String.fromCharCode(...v.slice(at,at+4));if(!/^[A-Z0-9]{4}$/.test(id))break;
 const len=version===4?synchsafe(v.slice(at+4,at+8)):be32(v,at+4);if(!len||at+10+len>size)break;
 const b=v.slice(at+10,at+10+len);
 if(id==='TIT2')out.title=textFrame(b);if(id==='TPE1')out.artist=textFrame(b);if(id==='TALB')out.album=textFrame(b);
 if(id==='APIC'&&len<8_000_000){let p=1;while(p<b.length&&b[p]!==0)p++;const mime=decoder.decode(b.slice(1,p))||'image/jpeg';p+=2;const enc=b[0],step=enc===1||enc===2?2:1;while(p+step<b.length){if(b[p]===0&&(step===1||b[p+1]===0)){p+=step;break}p+=step}if(p<b.length)out.coverBlob=new Blob([b.slice(p)],{type:mime})}
 at+=10+len;
 }
 return out;
}
function parseFLAC(v){
 if(v.length<4||decoder.decode(v.slice(0,4))!=='fLaC')return {};
 let at=4,last=false,out={};const dv=new DataView(v.buffer,v.byteOffset,v.byteLength);
 while(!last&&at+4<=v.length){const flag=v[at];last=!!(flag&128);const type=flag&127;const len=v[at+1]*65536+v[at+2]*256+v[at+3];at+=4;if(at+len>v.length)break;
 if(type===4&&len>=8){let p=at;const limit=at+len;const u=()=>{if(p+4>limit)return 0;const a=dv.getUint32(p,true);p+=4;return a};p+=Math.min(u(),limit-p);const count=Math.min(u(),300);
 for(let i=0;i<count&&p+4<=limit;i++){const l=u();if(l>limit-p)break;const pair=decoder.decode(v.slice(p,p+l));p+=l;const sep=pair.indexOf('=');if(sep<0)continue;const key=pair.slice(0,sep).toUpperCase(),val=safe(pair.slice(sep+1));if(key==='TITLE')out.title=val;if(key==='ARTIST')out.artist=val;if(key==='ALBUM')out.album=val}}
 if(type===6&&len<8_000_000){let p=at;const end=at+len;const u=()=>{if(p+4>end)return 0;const a=dv.getUint32(p,false);p+=4;return a};const m=u();p+=Math.min(m,end-p);p+=4;const desc=u();p+=Math.min(desc,end-p);p+=16;const imageSize=u();if(imageSize>0&&p+imageSize<=end)out.coverBlob=new Blob([v.slice(p,p+imageSize)],{type:'image/jpeg'})}
 at+=len;
 }
 return out;
}
export async function extractMetadata(file){
 const fallback=file.name.replace(/\.[^.]+$/,'');
 try{const first=new Uint8Array(await file.slice(0,10).arrayBuffer());let meta={};
 if(decoder.decode(first.slice(0,3))==='ID3'){const length=Math.min(file.size,10+synchsafe(first.slice(6,10)),12_000_000);meta=parseID3(new Uint8Array(await file.slice(0,length).arrayBuffer()))}
 else if(decoder.decode(first.slice(0,4))==='fLaC'){meta=parseFLAC(new Uint8Array(await file.slice(0,Math.min(file.size,12_000_000)).arrayBuffer()))}
 return {title:meta.title||fallback,artist:meta.artist||'Nieznany wykonawca',album:meta.album||'Nieznany album',coverBlob:meta.coverBlob||null}
 }catch{return {title:fallback,artist:'Nieznany wykonawca',album:'Nieznany album',coverBlob:null}}
}
