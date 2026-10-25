import {useEffect,useRef,useState} from 'react';
import {readTracks,storeTrack,removeTrack} from './libraryStore.js';
const allowed=/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i;
export function useAudioEngine(){
 const media=useRef(null),urls=useRef([]),latest=useRef({files:[],index:0}),[files,setFiles]=useState([]),[index,setIndex]=useState(0);
 latest.current={files,index};
 const [state,setState]=useState('idle'),[seconds,setSeconds]=useState(0),[duration,setDuration]=useState(0),[volume,setVolume]=useState(.7),[error,setError]=useState('');
 useEffect(()=>{const a=new Audio();media.current=a;a.preload='metadata';a.volume=.7;
 const onTime=()=>setSeconds(a.currentTime||0),onDuration=()=>setDuration(Number.isFinite(a.duration)?a.duration:0);
 const onPlay=()=>setState('playing'),onPause=()=>setState(a.ended?'stopped':'paused');
 const onWait=()=>setState('loading'),onError=()=>{setError('Nie można odtworzyć pliku w tej przeglądarce.');setState('error')};
 const onEnded=()=>{const {files:queue,index:at}=latest.current;if(queue.length>1&&at<queue.length-1){const next=queue[at+1];a.src=next.url;a.load();setIndex(at+1);setSeconds(0);setDuration(0);setState('loading');a.play().catch(()=>setState('paused'))}else{setState('stopped');setSeconds(a.duration||0)}};
 a.addEventListener('timeupdate',onTime);a.addEventListener('loadedmetadata',onDuration);a.addEventListener('durationchange',onDuration);a.addEventListener('playing',onPlay);a.addEventListener('pause',onPause);a.addEventListener('waiting',onWait);a.addEventListener('error',onError);a.addEventListener('ended',onEnded);
 return()=>{a.pause();a.removeAttribute('src');a.load();urls.current.forEach(URL.revokeObjectURL)};
 },[]);
 useEffect(()=>{let canceled=false;readTracks().then(records=>{if(canceled)return;const restored=records.map(({blob,...data})=>({...data,url:URL.createObjectURL(blob)}));urls.current.push(...restored.map(t=>t.url));setFiles(restored)}).catch(()=>setError('Nie można wczytać zapisanej biblioteki na tym urządzeniu.'));return()=>{canceled=true}},[]);
 const importFiles=async list=>{
  const incoming=Array.from(list||[]).filter(f=>allowed.test(f.name)||f.type.startsWith('audio/')).filter(f=>!files.some(existing=>existing.filename===f.name&&existing.size===f.size&&existing.modified===f.lastModified));
  if(!incoming.length){setError('Wybierz pliki audio MP3, WAV, OGG, M4A lub FLAC.');return}
  const songs=incoming.map((f,i)=>({id:'local-'+Date.now()+'-'+i,title:f.name.replace(/\.[^.]+$/,''),artist:'Plik lokalny',album:'Moja muzyka',duration:'--:--',art:['night','violet','blue','ocean'][i%4],url:URL.createObjectURL(f),filename:f.name,size:f.size,modified:f.lastModified}));
  urls.current.push(...songs.map(x=>x.url));setFiles(old=>old.concat(songs));setError('');
  const results=await Promise.allSettled(songs.map((track,i)=>{const {url,...metadata}=track;return storeTrack({...metadata,blob:incoming[i]})}));
  if(results.some(result=>result.status==='rejected'))setError('Pliki dodano na tę sesję, ale zapis trwały nie powiódł się (możliwy brak miejsca).');
 };
 const select=async i=>{
  const song=files[i],a=media.current;if(!song||!a)return;
  a.pause();a.src=song.url;a.load();setIndex(i);setSeconds(0);setDuration(0);setState('loading');setError('');
  try{await a.play()}catch(e){setState('paused');if(e.name!=='AbortError')setError('Dotknij Play, aby rozpocząć odtwarzanie.')}
 };
 const toggle=async()=>{
  const a=media.current;if(!a||!files.length)return;
  if(!a.src){await select(index);return}
  if(!a.paused){a.pause();return}
  if(a.ended)a.currentTime=0;
  try{setError('');await a.play()}catch(e){setState('paused');setError('Przeglądarka zablokowała odtwarzanie: '+e.message)}
 };
 useEffect(()=>{
  if(!('mediaSession' in navigator)||!files.length)return;
  const f=files[index];if(!f||typeof MediaMetadata==='undefined')return;
  navigator.mediaSession.metadata=new MediaMetadata({title:f.title,artist:f.artist,album:f.album});
  navigator.mediaSession.playbackState=state==='playing'?'playing':'paused';
  const handlers={play:()=>media.current?.play().catch(()=>{}),pause:()=>media.current?.pause(),
   previoustrack:()=>select((index-1+files.length)%files.length),
   nexttrack:()=>select((index+1)%files.length),
   seekto:({seekTime})=>{if(media.current&&Number.isFinite(seekTime))media.current.currentTime=seekTime}};
  Object.entries(handlers).forEach(([key,fn])=>{try{navigator.mediaSession.setActionHandler(key,fn)}catch{}});
  return()=>Object.keys(handlers).forEach(key=>{try{navigator.mediaSession.setActionHandler(key,null)}catch{}});
 },[files,index,state]);
 const remove=async id=>{const item=files.find(f=>f.id===id);if(!item)return;try{await removeTrack(id)}catch{setError('Nie można usunąć pliku z zapisanej biblioteki.');return}if(files[index]?.id===id){media.current?.pause();media.current?.removeAttribute('src');setState('stopped');setSeconds(0);setDuration(0);setIndex(0)}setFiles(old=>old.filter(f=>f.id!==id));URL.revokeObjectURL(item.url);urls.current=urls.current.filter(u=>u!==item.url)};
 const seek=p=>{const a=media.current;if(a&&Number.isFinite(a.duration)){a.currentTime=Math.min(a.duration,Math.max(0,a.duration*p/100));setSeconds(a.currentTime)}};
 const setGain=v=>{const n=Math.max(0,Math.min(1,v));setVolume(n);if(media.current)media.current.volume=n};
 return {files,index,state,seconds,duration,volume,error,importFiles,remove,select,toggle,seek,setGain,
 next:()=>files.length&&select((index+1)%files.length),
 prev:()=>files.length&&select((index-1+files.length)%files.length),
 stop:()=>{const a=media.current;if(a){a.pause();a.currentTime=0;setSeconds(0);setState('stopped')}}
 };
}
