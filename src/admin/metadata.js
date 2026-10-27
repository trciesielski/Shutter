// Tag extraction for admin uploads. Only values actually present in the file are reported as tags;
// anything inferred (e.g. a title from the file name) is marked as a guess so it is never mistaken for
// verified metadata.
import {parseBlob} from 'music-metadata';

const text=v=>typeof v==='string'?v.normalize('NFC').replace(/\0/g,'').trim():'';
const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max?v:null;

function audioDuration(file){
 return new Promise(resolve=>{
  const url=URL.createObjectURL(file),a=new Audio();
  const done=v=>{URL.revokeObjectURL(url);a.removeAttribute('src');resolve(v)};
  a.preload='metadata';
  a.onloadedmetadata=()=>done(Number.isFinite(a.duration)&&a.duration>0?a.duration:null);
  a.onerror=()=>done(null);
  setTimeout(()=>done(null),10000);
  a.src=url;
 });
}

export async function extractTags(file){
 const tags={},guessed={};
 let picture=null;
 try{
  const {common,format}=await parseBlob(file,{duration:true,skipCovers:false});
  const set=(k,v)=>{if(v!==null&&v!==undefined&&v!=='')tags[k]=v};
  set('title',text(common.title));
  set('artist',text(common.artist)||text(common.artists?.[0]));
  set('album',text(common.album));
  set('albumArtist',text(common.albumartist));
  set('genre',text(common.genre?.[0]));
  set('year',int(common.year,1000,2100));
  set('trackNumber',int(common.track?.no,1,9999));
  set('discNumber',int(common.disk?.no,1,999));
  const lyric=common.lyrics?.[0];
  set('lyrics',text(typeof lyric==='string'?lyric:lyric?.text||(Array.isArray(lyric?.syncText)?lyric.syncText.map(x=>x.text).join('\n'):'')));
  if(Number.isFinite(format.duration)&&format.duration>0)tags.duration=Math.round(format.duration*100)/100;
  const pic=common.picture?.find(p=>/^image\/(jpeg|png|webp)$/i.test(p.format))||null;
  if(pic){const type=pic.format.toLowerCase();picture=new File([pic.data],'embedded.'+(type==='image/png'?'png':type==='image/webp'?'webp':'jpg'),{type})}
 }catch{}
 if(!tags.duration){const d=await audioDuration(file);if(d)guessed.duration=Math.round(d*100)/100}
 if(!tags.title)guessed.title=file.name.replace(/\.[^.]+$/,'').replace(/[_]+/g,' ').trim();
 return {tags,guessed,picture};
}

export async function imageInfo(file){
 const bitmap=await createImageBitmap(file);
 const info={width:bitmap.width,height:bitmap.height};
 bitmap.close?.();
 const ratio=info.width/info.height;
 info.square=Math.abs(ratio-1)<=0.02;
 info.warning=!info.square?'Okładka nie jest kwadratowa — zostanie wyświetlona bez przycinania, z marginesami.':info.width<300?'Okładka ma niską rozdzielczość (poniżej 300 px).':null;
 return info;
}

// Scaled (never cropped) WebP thumbnail; skipped when the browser cannot encode WebP or the image is small.
export async function makeThumbnail(file,max=512){
 const bitmap=await createImageBitmap(file);
 const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
 if(scale>=1){bitmap.close?.();return null}
 const canvas=document.createElement('canvas');
 canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
 bitmap.close?.();
 const blob=await new Promise(r=>canvas.toBlob(r,'image/webp',0.86));
 if(!blob||blob.type!=='image/webp')return null;
 return new File([blob],'thumbnail.webp',{type:'image/webp'});
}
