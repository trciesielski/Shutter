import {Capacitor,registerPlugin} from '@capacitor/core';

const METHODS=new Set(['connect','disconnect','play','pause','toggle','stop','skipNext','skipPrevious','seekTo','setVolume','setQueue','playItem','setShuffle','setRepeat','getCatalog','getLibrary','getPlaylists','pickLocalFiles','removeLocalTrack','migrateWebStorage','createPlaylist','updatePlaylist','deletePlaylist','getAudioAnalysisCapabilities']);
export const SHUTTER_MEDIA_EVENTS=Object.freeze(['playbackState','position','queueChanged','metadataChanged','catalogChanged','libraryChanged','playlistChanged','audioFocusChanged','analysisFrame','error']);

export function createShutterMedia({platform=()=>Capacitor.getPlatform(),register=registerPlugin}={}){
  let plugin;
  function native(){
    if(platform()!=='android')throw new Error('ShutterMedia requires Android');
    return plugin??=register('ShutterMedia');
  }
  const api={
    isAvailable:()=>platform()==='android',
    addListener:(event,callback)=>{
      if(!SHUTTER_MEDIA_EVENTS.includes(event)||typeof callback!=='function')return Promise.reject(new TypeError('Invalid ShutterMedia listener'));
      try{return native().addListener(event,callback)}catch(error){return Promise.reject(error)}
    },
    removeAllListeners:()=>{try{return native().removeAllListeners()}catch(error){return Promise.reject(error)}},
  };
  for(const method of METHODS)api[method]=async(options={})=>{
    try{return await native()[method](options)}
    catch(error){throw new Error(error?.message||String(error),{cause:error})}
  };
  return api;
}

export const shutterMedia=createShutterMedia();
