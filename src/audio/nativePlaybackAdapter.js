import {createNativeState} from '../native/nativeState.js';
import {SHUTTER_MEDIA_EVENTS} from '../native/shutterMedia.js';

const track=t=>({id:t.id,source:t.source,title:t.title||'',artist:t.artist||'',album:t.album||'',durationMs:t.durationMs,duration:Math.max(0,(t.durationMs||0)/1000),artworkUri:t.artworkUri,uri:t.uri,coverUrl:t.artworkUri||null,url:t.uri});
const emptyEq=()=>({available:false,ready:false,bins:Array(32).fill(0),signalStatus:'unavailable',signalDebug:null});
const initial=()=>({files:[],ratings:{},index:0,state:'idle',seconds:0,duration:0,volume:.7,shuffle:false,repeat:'off',queueIds:[],catalog:{status:'loading',title:null,skipped:[],error:null},error:'',signalStatus:'unavailable',signalDebug:null,eq:emptyEq()});

export function createNativePlaybackAdapter(media){
 let state=createNativeState(),snapshot=initial(),notify=()=>{},cleanup=null,connected=false,hydrated=false,refreshing=false,queueTail=Promise.resolve(),analysisRevision=-1;
 const update=patch=>{snapshot={...snapshot,...patch};notify(snapshot)};
 const indexFor=(id,files=snapshot.files)=>Math.max(0,files.findIndex(x=>x.id===id));
 const applyState=value=>{
  if(!state.apply(value))return;
  update({mediaId:value.mediaId,state:value.state==='buffering'?'loading':value.state==='ended'?'stopped':value.state||'idle',seconds:Math.max(0,(value.positionMs||0)/1000),duration:value.durationMs>=0?value.durationMs/1000:0,volume:value.volume??snapshot.volume,shuffle:value.shuffle??snapshot.shuffle,repeat:value.repeat||snapshot.repeat,queueIds:Array.isArray(value.queue)?value.queue:snapshot.queueIds,index:indexFor(value.mediaId)});
 };
 const onEvent=(name,value)=>{
  if(name==='playbackState'){applyState(value);return}
  if(['position','queueChanged','metadataChanged'].includes(name)&&!state.apply(value))return;
  if(name==='position'){if(value.mediaId===snapshot.mediaId)update({seconds:Math.max(0,(value.positionMs||0)/1000),duration:value.durationMs>=0?value.durationMs/1000:snapshot.duration});return}
  if(name==='queueChanged'){if(Array.isArray(value.queue))update({queueIds:value.queue});return}
  if(name==='metadataChanged'){if(value.mediaId)update({mediaId:value.mediaId,index:indexFor(value.mediaId)});return}
  if(name==='analysisFrame'){
   if(Number.isSafeInteger(value?.revision)&&value.revision<=analysisRevision)return;
   if(Number.isSafeInteger(value?.revision))analysisRevision=value.revision;
   const signalStatus=value?.signalStatus||'unavailable',measured=signalStatus!=='unavailable'&&Array.isArray(value?.bands)&&value.bands.length===32;
   const bins=measured?value.bands.map(n=>Math.max(0,Math.min(100,Math.round(Number(n)||0)))):Array(32).fill(0);
   const signalDebug=value?.signalDebug&&typeof value.signalDebug==='object'?value.signalDebug:null;
   update({signalStatus,signalDebug,eq:{available:measured,ready:measured,bins,signalStatus,signalDebug}});
   return;
  }
  if(name==='error'){update({error:value.message||'Native playback error'});return}
  if((name==='catalogChanged'||name==='libraryChanged')&&hydrated&&!refreshing)refreshLibrary().catch(e=>update({error:e.message}));
 };
 async function connect(listener){
  if(cleanup)await cleanup();
  notify=listener;state=createNativeState();connected=true;hydrated=false;analysisRevision=-1;
  const handles=[];
  try{
   for(const name of SHUTTER_MEDIA_EVENTS)handles.push(await media.addListener(name,value=>{if(connected)onEvent(name,value)}));
   applyState(await media.connect());
  }catch(error){connected=false;await Promise.all(handles.map(h=>h.remove()));throw error}
  let disposed=false;
  cleanup=async()=>{if(disposed)return;disposed=true;connected=false;cleanup=null;await Promise.all(handles.map(h=>h.remove()));await media.disconnect()};
  return cleanup;
 }
 async function refreshLibrary(){
  if(refreshing)return snapshot.files;
  refreshing=true;
  try{
   const [catalogResult,libraryResult,ratingsResult]=await Promise.allSettled([media.getCatalog(),media.getLibrary(),media.getRatings()]);
   if(catalogResult.status==='rejected'&&libraryResult.status==='rejected')throw new Error(`Native library unavailable: ${libraryResult.reason?.message||libraryResult.reason}`);
   const catalog=catalogResult.status==='fulfilled'?catalogResult.value:{tracks:[]};
   const library=libraryResult.status==='fulfilled'?libraryResult.value:{tracks:[]};
   const failure=catalogResult.status==='rejected'?catalogResult.reason:libraryResult.status==='rejected'?libraryResult.reason:null;
   const files=[...(catalog.tracks||[]),...(library.tracks||[])].map(track);
   const unique=[...new Map(files.map(x=>[x.id,x])).values()];
   update({files:unique,ratings:ratingsResult.status==='fulfilled'?ratingsResult.value.ratings||{}:snapshot.ratings,index:indexFor(snapshot.mediaId,unique),error:failure?.message||'',catalog:{status:catalogResult.status==='rejected'?'error':unique.length?'ready':'empty',title:null,skipped:[],error:catalogResult.status==='rejected'?{message:failure.message}:null}});
   hydrated=true;
   return unique;
  }finally{refreshing=false}
 }
 const command=async(name,arg={})=>{try{const result=await media[name](arg);if(result?.eventType==='playbackState')applyState(result);return result}catch(e){update({error:e.message});throw e}};
 const serialize=action=>{const result=queueTail.then(action);queueTail=result.catch(()=>{});return result};
 const select=at=>serialize(async()=>{const id=snapshot.files[at]?.id;if(!id)return;const ids=snapshot.queueIds;if(ids.length>1&&ids.includes(id)){await command('setQueue',{trackIds:ids,startIndex:ids.indexOf(id)});return command('play')}return command('playItem',{trackId:id})});
 const seek=percent=>command('seekTo',{positionMs:Math.round(snapshot.duration*Math.max(0,Math.min(100,Number(percent)))*10)});
 const setGain=value=>command('setVolume',{value:Math.max(0,Math.min(1,Number(value)))});
 const setQueueIds=(ids,keepCurrent=false)=>{const valid=[...new Set(ids)].filter(id=>snapshot.files.some(x=>x.id===id));const current=valid.indexOf(snapshot.mediaId);return valid.length?command('setQueue',{trackIds:valid,startIndex:keepCurrent&&current>=0?current:0}):Promise.resolve()};
 const loadQueue=ids=>serialize(()=>setQueueIds(ids));
 const playQueue=(ids,selectedId)=>serialize(async()=>{const valid=[...new Set(ids)].filter(id=>snapshot.files.some(x=>x.id===id));const startIndex=valid.indexOf(selectedId);if(startIndex<0)return;await command('setQueue',{trackIds:valid,startIndex});await command('play')});
 const editQueue=ids=>serialize(async()=>{const positionMs=Math.round(snapshot.seconds*1000),current=snapshot.mediaId;await setQueueIds(ids,true);if(positionMs>0&&snapshot.mediaId===current)await command('seekTo',{positionMs})});
 const move=(from,to)=>{const ids=[...snapshot.queueIds];if(from<0||from>=ids.length||to<0||to>=ids.length)return;ids.splice(to,0,...ids.splice(from,1));return editQueue(ids)};
 const addNext=id=>{if(!snapshot.files.some(x=>x.id===id))return;const ids=snapshot.queueIds.filter(x=>x!==id),current=snapshot.mediaId;ids.splice(Math.max(0,ids.indexOf(current)+1),0,id);return editQueue(ids)};
 const rateTrack=async(trackId,rating)=>{const result=await command('setRating',{trackId,rating});update({ratings:{...snapshot.ratings,[trackId]:result.rating}});return result.rating};
 return {get snapshot(){return snapshot},connect,refreshLibrary,select,seek,setGain,loadQueue,playQueue,move,addNext,rateTrack,
  toggle:()=>command('toggle'),stop:()=>command('stop'),next:()=>command('skipNext'),prev:()=>command('skipPrevious'),
  toggleShuffle:()=>command('setShuffle',{enabled:!snapshot.shuffle}),cycleRepeat:()=>command('setRepeat',{mode:snapshot.repeat==='off'?'all':snapshot.repeat==='all'?'one':'off'}),
  importFiles:()=>command('pickLocalFiles'),remove:id=>command('removeLocalTrack',{trackId:id})};
}
