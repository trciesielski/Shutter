export const STORAGE_KEYS=Object.freeze([
  'shutter-user-playlists-v1',
  'shutter-favorites',
  'shutter-track-preferences-v1',
  'shutter-listening-history-v1',
  'shutter-last-position-v1',
]);
const MARKER='shutter-native-migration-v1';
const REPORT='shutter-native-migration-report-v1';

export function createNativeState(){
  let revision=-1;
  let snapshot=null;
  return {
    get snapshot(){return snapshot},
    get revision(){return revision},
    apply(event){
      if(event?.schemaVersion!==1||(event.eventType&&event.eventType!=='playbackState')||!Number.isSafeInteger(event.revision)||event.revision<=revision)return false;
      revision=event.revision;
      snapshot={...snapshot,...event};
      return true;
    },
  };
}

export function collectWebStorage(storage=globalThis.localStorage){
  return Object.fromEntries(STORAGE_KEYS.map(key=>[key,storage?.getItem(key)??null]));
}

export async function migrateLocalStorage(native,storage=globalThis.localStorage){
  if(!storage)throw new Error('localStorage unavailable');
  const payload=collectWebStorage(storage);
  // Native Room's marker is authoritative. Retry even if a prior WebView wrote a marker.
  const report=await native.migrateWebStorage({payload,schemaVersion:1});
  if(report?.completed||report?.alreadyCompleted){
    storage.setItem(REPORT,JSON.stringify(report));
    storage.setItem(MARKER,'1');
  }
  return report;
}
