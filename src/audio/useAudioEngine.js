import {useEffect,useRef,useState} from 'react';
const allowed=/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i;
export function useAudioEngine(){
 const media=useRef(null),urls=useRef([]),[files,setFiles]=useState([]),[index,setIndex]=useState(0);
 const [state,setState]=useState('idle'),[seconds,setSeconds]=useState(0),[duration,setDuration]=useState(0),[volume,setVolume]=useState(.7),[error,setError]=useState('');
 useEffect(()=>{const a=new Audio();media.current=a;a.preload='metadata';a.volume=.7;
 const onTime=()=>setSeconds(a.currentTime||0),onDuration=()=>setDuration(Number.isFinite(a.duration)?a.duration:0);
 const onPlay=()=>setState('playing'),onPause=()=>setState(a.ended?'stopped':'paused');
 const onWait=()=>setState('loading'),onError=()=>{setError('Nie można odtworzyć pliku w tej przeglądarce.');setState('error')};
 const onEnded=()=>{setState('stopped');setSeconds(0)};
 a.addEventListener('timeupdate',onTime);a.addEventListener('loadedmetadata',onDuration);a.addEventListener('durationchange',onDuration);a.addEventListener('playing',onPlay);a.addEventListener('pause',onPause);a.addEventListener('waiting',onWait);a.addEventListener('error',onError);a.addEventListener('ended',onEnded);
 return()=>{a.pause();a.removeAttribute('src');a.load();urls.current.forEach(URL.revokeObjectURL)};
 },[]);
 const importFiles=list=>{
  const incoming=Array.from(list||[]).filter(f=>allowed.test(f.name)||f.type.startsWith('audio/'));
  if(!incoming.length){setError('Wybierz pliki audio MP3, WAV, OGG, M4A lub FLAC.');return}
  const songs=incoming.map((f,i)=>({id:'local-'+Date.now()+'-'+i,title:f.name.replace(/\.[^.]+$/,''),artist:'Plik lokalny',album:'Moja muzyka',duration:'--:--',art:['night','violet','blue','ocean'][i%4],url:URL.createObjectURL(f),filename:f.name}));
  urls.current.push(...songs.map(x=>x.url));setFiles(old=>old.concat(songs));setError('');
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
  const f=files[index];if(!f)return;
  navigator.mediaSession.metadata=new MediaMetadata({title:f.title,artist:f.artist,album:f.album});
  navigator.mediaSession.playbackState=state==='playing'?'playing':'paused';
  const handlers={play:()=>media.current?.play().catch(()=>{}),pause:()=>media.current?.pause(),
   previoustrack:()=>select((index-1+files.length)%files.length),
   nexttrack:()=>select((index+1)%files.length),
   seekto:({seekTime})=>{if(media.current&&Number.isFinite(seekTime))media.current.currentTime=seekTime}};
  Object.entries(handlers).forEach(([key,fn])=>{try{navigator.mediaSession.setActionHandler(key,fn)}catch{}});
  return()=>Object.keys(handlers).forEach(key=>{try{navigator.mediaSession.setActionHandler(key,null)}catch{}});
 },[files,index,state]);
 const seek=p=>{const a=media.current;if(a&&Number.isFinite(a.duration)){a.currentTime=Math.min(a.duration,Math.max(0,a.duration*p/100));setSeconds(a.currentTime)}};
 const setGain=v=>{const n=Math.max(0,Math.min(1,v));setVolume(n);if(media.current)media.current.volume=n};
 return {files,index,state,seconds,duration,volume,error,importFiles,select,toggle,seek,setGain,
 next:()=>files.length&&select((index+1)%files.length),
 prev:()=>files.length&&select((index-1+files.length)%files.length),
 stop:()=>{const a=media.current;if(a){a.pause();a.currentTime=0;setSeconds(0);setState('stopped')}}
 };
}
