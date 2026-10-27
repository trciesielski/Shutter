import {useEffect,useState} from 'react';
import {isNativeAndroid} from '../platform.js';
import {useNativePlaylists} from './useNativePlaylists.js';
const KEY='shutter-user-playlists-v1';
const FAV='shutter-favorites';
const load=()=>{try{const a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a.filter(x=>x&&typeof x.id==='string'&&Array.isArray(x.tracks)) : []}catch{return []}};
export function usePlaylists(options={}){return isNativeAndroid()?useNativePlaylists(options):useWebPlaylists()}
function useWebPlaylists(){
 const [lists,setLists]=useState(load);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(lists))}catch{}},[lists]);
 const create=(name,trackId)=>{const clean=name.trim();if(!clean)return;setLists(a=>{if(a.some(x=>x.name.toLocaleLowerCase()===clean.toLocaleLowerCase()))return a;return [...a,{id:crypto.randomUUID?.()||String(Date.now()),name:clean,tracks:trackId?[trackId]:[]}]})};
 const ensureFavorite=id=>setLists(a=>{const fav=a.find(x=>x.id===FAV);if(fav)return a.map(x=>x.id===FAV?{...x,tracks:x.tracks.includes(id)?x.tracks.filter(t=>t!==id):[...x.tracks,id]}:x);return [...a,{id:FAV,name:'Ulubione',tracks:[id]}]});
 const addTrack=(listId,trackId)=>setLists(a=>a.map(x=>x.id===listId&&!x.tracks.includes(trackId)?{...x,tracks:[...x.tracks,trackId]}:x));
 const toggleTrack=(listId,trackId)=>setLists(a=>a.map(x=>x.id===listId?{...x,tracks:x.tracks.includes(trackId)?x.tracks.filter(t=>t!==trackId):[...x.tracks,trackId]}:x));
 const remove=id=>setLists(a=>a.filter(x=>x.id!==id));
 return {lists,create,ensureFavorite,addTrack,toggleTrack,remove,isFavorite:id=>lists.some(x=>x.id===FAV&&x.tracks.includes(id))};
}
