const KEY='shutter-track-preferences-v1';
const RATINGS=new Set(['up','down']);

function readRatings(storage=globalThis.localStorage){
 if(!storage)return {};
 try{
  const value=JSON.parse(storage.getItem(KEY)||'{}');
  return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 }catch{return {}}
}

function saveRatings(ratings,storage=globalThis.localStorage){
 if(!storage)return;
 try{storage.setItem(KEY,JSON.stringify(ratings))}catch{}
}

export function getTrackRating(trackId,storage=globalThis.localStorage){
 const rating=readRatings(storage)[trackId];
 return RATINGS.has(rating)?rating:null;
}

export function setTrackRating(trackId,rating,storage=globalThis.localStorage){
 if(!trackId)return null;
 const ratings=readRatings(storage);
 if(RATINGS.has(rating))ratings[trackId]=rating;
 else delete ratings[trackId];
 saveRatings(ratings,storage);
 return RATINGS.has(ratings[trackId])?ratings[trackId]:null;
}
