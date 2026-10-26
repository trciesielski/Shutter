function safePublicUrl(value){
 if(typeof value!=='string'||!value.trim())return null;
 try{
  const url=new URL(value);
  return url.protocol==='http:'||url.protocol==='https:'?url.toString():null;
 }catch{return null}
}

export function getPublicShareUrl(track){
 if(!track)return null;
 return safePublicUrl(track.publicUrl)||safePublicUrl(track.shareUrl);
}

export function buildSharePayload(track){
 const title=String(track?.title||'Utwór');
 const artist=String(track?.artist||'').trim();
 const payload={title,text:artist?`${title} — ${artist}`:title};
 const url=getPublicShareUrl(track);
 if(url)payload.url=url;
 return payload;
}

export async function shareTrack(track,navigatorObject=globalThis.navigator){
 const payload=buildSharePayload(track);
 if(typeof navigatorObject?.share==='function'){
  try{
   await navigatorObject.share(payload);
   return 'shared';
  }catch(error){
   if(error?.name==='AbortError')return 'cancelled';
  }
 }
 const url=payload.url;
 if(url&&typeof navigatorObject?.clipboard?.writeText==='function'){
  try{await navigatorObject.clipboard.writeText(url);return 'copied'}catch{}
 }
 return 'unavailable';
}
