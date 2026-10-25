// IndexedDB persists local audio blobs in the browser profile; no server upload.
const DB='shutter-audio-v1',STORE='tracks';
export function openLibrary(){
 return new Promise((resolve,reject)=>{
  if(!('indexedDB' in globalThis)){reject(new Error('IndexedDB niedostępna'));return}
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}
async function transaction(mode,action){
 const db=await openLibrary();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
  const req=action(store);
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
  tx.onerror=()=>reject(tx.error);
 })}finally{db.close()}
}
export const readTracks=()=>transaction('readonly',s=>s.getAll());
export const storeTrack=record=>transaction('readwrite',s=>s.put(record));
export const removeTrack=id=>transaction('readwrite',s=>s.delete(id));
