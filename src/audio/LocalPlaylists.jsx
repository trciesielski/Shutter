import React,{useState} from 'react';
import {Heart,Music2,Plus,Play,Pause,ChevronLeft,Trash2,X} from 'lucide-react';
export default function LocalPlaylists({tracks,onPlay,onToggle,activeId,isPlaying,playlists}){
 const [name,setName]=useState(''),[opened,setOpened]=useState(null);
 const {lists,create,toggleTrack,remove}=playlists;
 const selected=lists.find(l=>l.id===opened);
 const add=()=>{if(!name.trim())return;create(name);setName('')};
 return <section className="local-playlists">
  <div className="playlist-new"><input aria-label="Nazwa nowej playlisty" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')add()}} placeholder="Nazwa nowej playlisty"/><button onClick={add} disabled={!name.trim()}><Plus size={17}/> Utwórz</button></div>
  {!selected?<div className="playlist-tiles">
   {lists.map((list,i)=><button className="playlist-tile" key={list.id} onClick={()=>setOpened(list.id)}>
    <span className={'playlist-tile-art playlist-tone-'+i%4}>{list.id==='shutter-favorites'?<Heart size={42} strokeWidth={1.6}/>:<Music2 size={42} strokeWidth={1.6}/>}<span className="playlist-tile-play"><Play size={22} fill="currentColor"/></span></span>
    <strong>{list.name}</strong><small>{list.tracks.length} {list.tracks.length===1?'utwór':'utworów'}</small>
   </button>)}
   {!lists.length&&<p className="playlist-hint">Utwórz playlistę lub dodaj utwór do Ulubionych z menu trzech kropek.</p>}
  </div>:<div className="playlist-detail">
   <div className="playlist-detail-head"><button className="playlist-back" onClick={()=>setOpened(null)} aria-label="Wróć do playlist"><ChevronLeft size={20}/> Playlisty</button><button className="playlist-delete" onClick={()=>{remove(selected.id);setOpened(null)}}><Trash2 size={15}/> Usuń playlistę</button></div>
   <h2>{selected.name}</h2><p>{selected.tracks.length} utworów</p>
   {tracks.filter(t=>selected.tracks.includes(t.id)).map(t=><div className="playlist-detail-track" key={t.id}><span className="playlist-detail-track-title">{t.title}</span><button aria-label={(activeId===t.id&&isPlaying?'Wstrzymaj ':'Odtwórz ')+t.title} onClick={()=>activeId===t.id?onToggle():onPlay(tracks.findIndex(x=>x.id===t.id))}>{activeId===t.id&&isPlaying?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button><button aria-label={'Usuń '+t.title+' z playlisty'} onClick={()=>toggleTrack(selected.id,t.id)}><X size={17}/></button></div>)}
   {!selected.tracks.length&&<p className="playlist-hint">Pusta playlista. Dodaj utwory w Bibliotece, korzystając z menu trzech kropek.</p>}
  </div>}
 </section>;
}
