import {useEffect,useRef,useState} from 'react';
import {readTracks,storeTrack,removeTrack} from './libraryStore.js';
import {extractMetadata} from './musicMetadata.js';
import {nextIndex,previousIndex,reordered} from './queueLogic.js';
import {recordListen,readHistory,historyStats,clearHistory} from './listeningHistory.js';
import {useEqualizer} from './useEqualizer.js';

const AUDIO_EXT=/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const positionKey='shutter-last-position-v1';
const fadeKey='shutter-crossfade-v1';
function persisted(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}

export function useAudioEngine(){
 const decks=useRef([]),activeDeck=useRef(0),urls=useRef([]),latest=useRef({});
 const change=useRef(null),busy=useRef(false),fadeTimer=useRef(null),recorded=useRef(null),activeTrackId=useRef(null),supportsDsp=useRef(false),upNext=useRef(-1);
 const eq=useEqualizer(decks);
 const [files,setFiles]=useState([]),[index,setIndex]=useState(0),[state,setState]=useState('idle');
 const [seconds,setSeconds]=useState(0),[duration,setDuration]=useState(0),[volume,setVolume]=useState(.7),[error,setError]=useState('');
 const [shuffle,setShuffle]=useState(false),[repeat,setRepeat]=useState('off'),[queueIds,setQueueIds]=useState([]);
 const [history,setHistory]=useState(readHistory),[transition,setTransitionState]=useState(()=>clamp(Number(persisted(fadeKey,0)),0,12));
 latest.current={files,index,shuffle,repeat,queueIds,transition};
 const current=()=>decks.current[activeDeck.current]||null;
 const orderOf=info=>(info.queueIds.length?info.queueIds.map(id=>info.files.findIndex(f=>f.id===id)).filter(i=>i>=0):info.files.map((_,i)=>i));
 const neighbor=(atEnd=false)=>{
  const info=latest.current,order=orderOf(info),pos=Math.max(0,order.indexOf(info.index));
  if(upNext.current>=0&&order.includes(upNext.current))return upNext.current;
  const at=nextIndex({length:order.length,index:pos,shuffle:info.shuffle,repeat:info.repeat},atEnd);
  const resolved=at>=0?order[at]:-1;
  if(atEnd&&resolved>=0)upNext.current=resolved;
  return resolved;
 };

 useEffect(()=>{
  const pair=[new Audio(),new Audio()];decks.current=pair;
  pair.forEach((a,i)=>{
   a.preload='auto';a.volume=.7;
   a.addEventListener('timeupdate',()=>{
    if(i!==activeDeck.current)return;
    setSeconds(a.currentTime||0);
    const info=latest.current,f=info.files[info.index],remaining=a.duration-a.currentTime;
    if(f&&Number.isFinite(a.currentTime)&&Math.floor(a.currentTime)%5===0){
      try{localStorage.setItem(positionKey,JSON.stringify({id:f.id,time:a.currentTime}))}catch{}
    }
    if(info.repeat!=='one'&&Number.isFinite(remaining)&&remaining>0&&remaining<20&&!busy.current){
      const at=neighbor(true),upcoming=info.files[at],standby=decks.current[1-i];
      if(upcoming&&standby&&standby.src!==upcoming.url){standby.src=upcoming.url;standby.preload='auto';standby.load()}
    }
    if(info.transition>0&&supportsDsp.current&&info.repeat!=='one'&&Number.isFinite(remaining)&&remaining>0&&remaining<=info.transition+.15&&!busy.current&&!a.paused){
      const at=neighbor(true);if(at>=0&&at!==info.index)change.current?.(at,true);
    }
   });
   a.addEventListener('loadedmetadata',()=>{if(i===activeDeck.current)setDuration(Number.isFinite(a.duration)?a.duration:0)});
   a.addEventListener('durationchange',()=>{if(i===activeDeck.current)setDuration(Number.isFinite(a.duration)?a.duration:0)});
   a.addEventListener('playing',()=>{if(i!==activeDeck.current)return;setState('playing');const info=latest.current,f=info.files.find(x=>x.id===activeTrackId.current)||info.files[info.index];if(f&&recorded.current!==f.id){recorded.current=f.id;setHistory(recordListen(f))}});
   a.addEventListener('pause',()=>{if(i===activeDeck.current)setState(a.ended?'stopped':'paused')});
   a.addEventListener('waiting',()=>{if(i===activeDeck.current)setState('loading')});
   a.addEventListener('error',()=>{if(i===activeDeck.current){setError('Nie można odtworzyć tego formatu w tej przeglądarce.');setState('error')}});
   a.addEventListener('ended',()=>{if(i!==activeDeck.current)return;const at=neighbor(true);if(at>=0){change.current?.(at,false)}else{setState('stopped');setSeconds(a.duration||0)}});
  });
  let disposed=false;
  readTracks().then(records=>{
   if(disposed)return;
   const restored=records.map(({blob,...meta})=>({...meta,url:URL.createObjectURL(blob)}));
   urls.current.push(...restored.map(f=>f.url));setFiles(existing=>{const seen=new Set(existing.map(f=>f.id));return [...restored.filter(f=>!seen.has(f.id)),...existing]});setQueueIds(old=>[...restored.map(f=>f.id),...old.filter(id=>!restored.some(f=>f.id===id))]);
   const last=persisted(positionKey,null),idx=restored.findIndex(f=>f.id===last?.id);
   if(idx>=0){setIndex(idx);activeTrackId.current=restored[idx].id;pair[0].src=restored[idx].url;pair[0].load();pair[0].addEventListener('loadedmetadata',()=>{if(Number.isFinite(last.time)&&last.time>=0&&last.time<pair[0].duration){pair[0].currentTime=last.time;setSeconds(last.time)}},{once:true})}
  }).catch(()=>{if(!disposed)setError('Nie można wczytać lokalnej biblioteki.')});
  return()=>{disposed=true;clearTimeout(fadeTimer.current);pair.forEach(a=>{a.pause();a.removeAttribute('src');a.load()});urls.current.forEach(URL.revokeObjectURL)};
 },[]);

 const select=async(at,withFade=true)=>{
  const info=latest.current,f=info.files[at];if(!f||!decks.current.length)return;
  if(busy.current)return;
  const currentDeck=activeDeck.current,old=decks.current[currentDeck];
  let cross=Boolean(withFade&&info.transition>0&&!old.paused&&old.src&&at!==info.index);
  const standby=decks.current[1-currentDeck];
  let preloaded=Boolean(!cross&&old.ended&&standby?.src===f.url);
  let standbyReady=Boolean((cross||preloaded)&&standby?.src===f.url);
  let targetDeck=cross||preloaded?1-currentDeck:currentDeck,target=decks.current[targetDeck];
  busy.current=true;
  setError('');
  try{
   const ok=await eq.activate();
   supportsDsp.current=ok;
   if(!ok){cross=false;preloaded=false;standbyReady=false;targetDeck=currentDeck;target=old;busy.current=false}
   if(!cross){clearTimeout(fadeTimer.current);if(!preloaded)standby.pause();if(ok)eq.setDeck(targetDeck);old.pause()}
   if(!standbyReady){target.src=f.url;target.load()}target.volume=volume;
   if(cross){eq.setDeck(currentDeck)}
   // Playback starts from the user's interaction; both decks share the same EQ graph.
   activeTrackId.current=f.id;
   await target.play();
   if(cross){eq.mixDecks(currentDeck,targetDeck,info.transition);activeDeck.current=targetDeck;fadeTimer.current=setTimeout(()=>{old.pause();old.removeAttribute('src');old.load();busy.current=false},info.transition*1000+150)}else if(preloaded){activeDeck.current=targetDeck;old.removeAttribute('src');old.load()}
   upNext.current=-1;
   if(recorded.current!==f.id){recorded.current=f.id;setHistory(recordListen(f))}setIndex(at);setSeconds(0);setDuration(0);setState('playing');
   if(!cross)busy.current=false;
  }catch(e){busy.current=false;if(cross){target.pause();eq.setDeck(currentDeck)}setState('paused');if(e.name!=='AbortError')setError('Nie można rozpocząć odtwarzania: '+e.message)}
 };
 change.current=select;

 const importFiles=async list=>{
  const input=Array.from(list||[]).filter(f=>AUDIO_EXT.test(f.name)||f.type.startsWith('audio/'));
  const filtered=input.filter(f=>!latest.current.files.some(x=>x.filename===f.name&&x.size===f.size&&x.modified===f.lastModified));
  if(!filtered.length){setError('Nie znaleziono nowych plików audio.');return}
  const meta=await Promise.all(filtered.map(extractMetadata));
  const added=filtered.map((file,i)=>({id:'local-'+Date.now()+'-'+i,title:meta[i].title,artist:meta[i].artist,album:meta[i].album,coverBlob:meta[i].coverBlob,url:URL.createObjectURL(file),filename:file.name,size:file.size,modified:file.lastModified,art:['night','violet','blue','ocean'][i%4]}));
  urls.current.push(...added.map(x=>x.url));setFiles(old=>old.concat(added));setQueueIds(old=>old.concat(added.map(x=>x.id)));setError('');
  const saved=await Promise.allSettled(added.map((f,i)=>{const {url,...data}=f;return storeTrack({...data,blob:filtered[i]})}));
  if(saved.some(x=>x.status==='rejected'))setError('Brak miejsca: część plików dodano tylko do tej sesji.');
 };
 const toggle=async()=>{
  if(busy.current)return;
  const a=current();if(!a||!latest.current.files.length)return;
  if(!a.src){await select(latest.current.index,false);return}
  if(!a.paused){a.pause();return}
  try{await eq.activate();if(a.ended)a.currentTime=0;await a.play();setError('')}catch(e){setError('Nie można wznowić odtwarzania: '+e.message)}
 };
 const stop=()=>{clearTimeout(fadeTimer.current);busy.current=false;decks.current.forEach(a=>{a.pause();if(a.src)a.currentTime=0});setSeconds(0);setState('stopped')};
 const seek=p=>{const a=current();if(a&&Number.isFinite(a.duration)&&a.duration>0){a.currentTime=clamp(a.duration*p/100,0,a.duration);setSeconds(a.currentTime)}};
 const setGain=v=>{const n=clamp(v,0,1);setVolume(n);decks.current.forEach(a=>a.volume=n)};
 const next=()=>{const at=neighbor(false);if(at>=0)select(at)};
 const prev=()=>{const a=current();if(a&&a.currentTime>3){a.currentTime=0;return}const info=latest.current,order=orderOf(info),pos=order.indexOf(info.index);if(pos>0)select(order[pos-1],false)};
 const remove=async id=>{
  if(busy.current)return;
  try{await removeTrack(id)}catch{setError('Nie można usunąć pliku.');return}
  const f=latest.current.files.find(x=>x.id===id);if(f?.url){URL.revokeObjectURL(f.url);urls.current=urls.current.filter(x=>x!==f.url)}
  const removedIndex=latest.current.files.findIndex(x=>x.id===id);
  if(latest.current.files[latest.current.index]?.id===id){
   stop();decks.current.forEach(a=>{a.removeAttribute('src');a.load()});
   activeTrackId.current=null;recorded.current=null;setDuration(0);
   setIndex(0);
  }else if(removedIndex>=0&&removedIndex<latest.current.index){
   setIndex(i=>Math.max(0,i-1));
  }
  setFiles(a=>a.filter(f=>f.id!==id));setQueueIds(a=>a.filter(x=>x!==id));
 };
 const move=(from,to)=>setQueueIds(ids=>reordered(ids,from,to));
 const addNext=id=>setQueueIds(ids=>{const cleaned=ids.filter(x=>x!==id),p=cleaned.indexOf(latest.current.files[latest.current.index]?.id);cleaned.splice(Math.max(0,p+1),0,id);return cleaned});
 const cycleRepeat=()=>{upNext.current=-1;setRepeat(v=>v==='off'?'all':v==='all'?'one':'off')};
 const setTransition=v=>{const n=clamp(Number(v),0,12);setTransitionState(n);try{localStorage.setItem(fadeKey,JSON.stringify(n))}catch{}};
 const clearPlays=()=>{clearHistory();setHistory([])};
 useEffect(()=>{
  if(!('mediaSession' in navigator)||!files[index]||typeof MediaMetadata==='undefined')return;
  const f=files[index];navigator.mediaSession.metadata=new MediaMetadata({title:f.title,artist:f.artist,album:f.album});
  navigator.mediaSession.playbackState=state==='playing'?'playing':'paused';
  const handlers={play:()=>toggle(),pause:()=>current()?.pause(),nexttrack:()=>next(),previoustrack:()=>prev(),seekto:e=>{if(Number.isFinite(e.seekTime)&&current())current().currentTime=e.seekTime}};
  for(const [key,fn] of Object.entries(handlers))try{navigator.mediaSession.setActionHandler(key,fn)}catch{}
  return()=>{for(const key of Object.keys(handlers))try{navigator.mediaSession.setActionHandler(key,null)}catch{}};
 },[files,index,state,shuffle,repeat,queueIds]);

 return {files,index,state,seconds,duration,volume,error,eq,importFiles,remove,select,toggle,stop,seek,setGain,next,prev,
 queueIds,move,addNext,shuffle,setShuffle:v=>{upNext.current=-1;setShuffle(v)},repeat,cycleRepeat,transition,setTransition,
 history,historyStats:historyStats(history),clearPlays};
}
