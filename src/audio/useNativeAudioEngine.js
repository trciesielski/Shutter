import {useEffect,useRef,useState} from 'react';
import {createNativePlaybackAdapter} from './nativePlaybackAdapter.js';
import {shutterMedia} from '../native/shutterMedia.js';
import {migrateLocalStorage} from '../native/nativeState.js';
import {platformCapabilities} from '../platform.js';

const nativeCapabilities={...platformCapabilities('mobile'),nativePlayback:true,nativeAnalysis:false};

export async function startNativePlayback(adapter,media,storage,onState){
 const cleanup=await adapter.connect(onState);
 let migrationCompleted=false,error='';
 const retry=async()=>{
  error='';
  try{const result=await migrateLocalStorage(media,storage);migrationCompleted=Boolean(result?.completed||result?.alreadyCompleted);if(!migrationCompleted)error='Migracja danych lokalnych nie została zakończona.'}
  catch(e){error=e.message}
  try{await adapter.refreshLibrary()}catch(e){error=error||e.message}
  return {migrationCompleted,error};
 };
 const result=await retry();
 return {...result,cleanup,retry};
}
export async function resumeNativePlayback(boot,adapter,media,storage,onState){
 if(!boot)return startNativePlayback(adapter,media,storage,onState);
 return {...boot,...await boot.retry()};
}

export function useNativeAudioEngine(){
 const adapter=useRef(null);if(!adapter.current)adapter.current=createNativePlaybackAdapter(shutterMedia);
 const [snapshot,setSnapshot]=useState(adapter.current.snapshot),[startupError,setStartupError]=useState(''),[nativeReady,setNativeReady]=useState(false);
 const boot=useRef(null);
 useEffect(()=>{
  let live=true;
  startNativePlayback(adapter.current,shutterMedia,globalThis.localStorage,s=>{if(live)setSnapshot(s)})
   .then(result=>{if(live){boot.current=result;setStartupError(result.error);setNativeReady(v=>v+1)}else result.cleanup()})
   .catch(e=>{if(live)setStartupError(e.message)});
  return()=>{live=false;boot.current?.cleanup();boot.current=null};
 },[]);
 const invoke=name=>(...args)=>adapter.current[name](...args).catch(e=>setStartupError(e.message));
 const reloadCatalog=async()=>{try{const result=await resumeNativePlayback(boot.current,adapter.current,shutterMedia,globalThis.localStorage,setSnapshot);boot.current=result;setStartupError(result.error);setNativeReady(v=>v+1)}catch(e){setStartupError(e.message)}};
 return {...snapshot,eq:snapshot.eq,capabilities:{...nativeCapabilities,nativeAnalysis:Boolean(snapshot.eq?.available)},error:startupError||snapshot.error,nativeReady,reloadCatalog,
  importFiles:invoke('importFiles'),remove:invoke('remove'),select:invoke('select'),toggle:invoke('toggle'),stop:invoke('stop'),seek:invoke('seek'),setGain:invoke('setGain'),next:invoke('next'),prev:invoke('prev'),loadQueue:invoke('loadQueue'),playQueue:invoke('playQueue'),move:invoke('move'),addNext:invoke('addNext'),rateTrack:invoke('rateTrack'),toggleShuffle:invoke('toggleShuffle'),cycleRepeat:invoke('cycleRepeat'),
  transition:0,setTransition:()=>{},history:[],historyStats:[],clearPlays:()=>{}};
}
