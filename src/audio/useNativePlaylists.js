import {useEffect,useRef,useState} from 'react';
import {shutterMedia} from '../native/shutterMedia.js';
const FAV='shutter-favorites';

export function createNativePlaylistStore(media,notify){
 let lists=[];
 const set=value=>{lists=value;notify(lists)};
 const refresh=async()=>{const result=await media.getPlaylists();set(result.playlists||[]);return lists};
 const save=async(list,create)=>{await media[create?'createPlaylist':'updatePlaylist']({id:list.id,name:list.name,trackIds:list.tracks});await refresh()};
 const create=async(name,trackId)=>{const clean=name.trim();if(!clean||lists.some(x=>x.name.toLocaleLowerCase()===clean.toLocaleLowerCase()))return;await save({id:crypto.randomUUID(),name:clean,tracks:trackId?[trackId]:[]},true)};
 const toggleTrack=async(id,trackId)=>{const list=lists.find(x=>x.id===id);if(!list)return;await save({...list,tracks:list.tracks.includes(trackId)?list.tracks.filter(x=>x!==trackId):[...list.tracks,trackId]},false)};
 const addTrack=async(id,trackId)=>{const list=lists.find(x=>x.id===id);if(list&&!list.tracks.includes(trackId))await save({...list,tracks:[...list.tracks,trackId]},false)};
 const ensureFavorite=async id=>{const fav=lists.find(x=>x.id===FAV);if(fav)return toggleTrack(FAV,id);await save({id:FAV,name:'Ulubione',tracks:[id]},true)};
 const remove=async id=>{await media.deletePlaylist({id});await refresh()};
 return {get lists(){return lists},refresh,create,ensureFavorite,addTrack,toggleTrack,remove,isFavorite:id=>lists.some(x=>x.id===FAV&&x.tracks.includes(id))};
}
export function useNativePlaylists({ready=false}={}){
 const [lists,setLists]=useState([]),[error,setError]=useState('');
 const store=useRef(null);if(!store.current)store.current=createNativePlaylistStore(shutterMedia,setLists);
 useEffect(()=>{if(!ready)return;let live=true;let handle;store.current.refresh().catch(e=>{if(live)setError(e.message)});shutterMedia.addListener('playlistChanged',()=>{if(live)store.current.refresh().catch(e=>setError(e.message))}).then(x=>{if(live)handle=x;else x.remove()}).catch(e=>{if(live)setError(e.message)});return()=>{live=false;handle?.remove()}},[ready]);
 const invoke=name=>(...args)=>store.current[name](...args).catch(e=>setError(e.message));
 return {lists,error,create:invoke('create'),ensureFavorite:invoke('ensureFavorite'),addTrack:invoke('addTrack'),toggleTrack:invoke('toggleTrack'),remove:invoke('remove'),isFavorite:id=>store.current.isFavorite(id)};
}
