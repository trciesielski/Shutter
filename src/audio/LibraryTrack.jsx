import React,{useState,useRef,useEffect} from 'react';
import {MoreVertical,Heart,Plus,ListPlus,Play,Pause,Trash2} from 'lucide-react';
export default function LibraryTrack({track,index,active,playing,onPlay,onToggle,onRemove,playlists}){
 const [open,setOpen]=useState(false),[creating,setCreating]=useState(false),[name,setName]=useState('');
 const ref=useRef(null),hold=useRef(null),held=useRef(false);
 const clearHold=()=>{if(hold.current){clearTimeout(hold.current);hold.current=null}};
 useEffect(()=>()=>clearHold(),[]);
 const down=e=>{if(e.button!==0&&e.pointerType==='mouse')return;held.current=false;clearHold();hold.current=setTimeout(()=>{held.current=true;setOpen(true)},550)};
 const up=()=>clearHold();
 useEffect(()=>{if(!open)return;const close=e=>{if(!ref.current?.contains(e.target))setOpen(false)};const esc=e=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('pointerdown',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',esc)}},[open]);
 return <div className={'library-track '+(active?'selected':'')} ref={ref}>
  <button className="library-track-main" onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} onContextMenu={e=>{e.preventDefault();clearHold();held.current=true;setOpen(true)}} onClick={()=>{if(held.current){held.current=false;return}onPlay(index)}} aria-label={'Odtwórz utwór '+track.title}>
   <span className="library-track-art" aria-hidden="true"><span className="library-cover-play">{active&&playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</span></span>
   <span className="library-track-title"><strong>{track.title}</strong><small>{track.artist||'Plik lokalny'}</small></span>
  </button>
  <button type="button" className="library-track-cover-action" onClick={()=>active?onToggle():onPlay(index)} aria-label={active&&playing?"Pauza":"Odtwórz"}>{active&&playing?<Pause size={16} fill="currentColor"/>:<Play size={16} fill="currentColor"/>}</button>
  <button type="button" className="library-track-menu-trigger" aria-label={'Menu utworu '+track.title} onClick={()=>setOpen(x=>!x)} aria-expanded={open}><MoreVertical size={21}/></button>
  {open&&<div className="library-track-popover" role="group" aria-label={'Akcje dla '+track.title}>
   <button onClick={()=>{onPlay(index);setOpen(false)}}><Play size={17}/> Odtwórz</button>
   <button onClick={()=>{playlists.ensureFavorite(track.id);setOpen(false)}}><Heart size={17} fill={playlists.isFavorite(track.id)?'currentColor':'none'}/>{playlists.isFavorite(track.id)?'Usuń z Ulubionych':'Dodaj do Ulubionych'}</button>
   <div className="library-track-divider"/>
   <span className="library-track-menu-caption">Dodaj do playlisty</span>
   {playlists.lists.filter(l=>l.id!=='shutter-favorites').map(l=><button key={l.id} disabled={l.tracks.includes(track.id)} onClick={()=>{playlists.addTrack(l.id,track.id);setOpen(false)}}><ListPlus size={17}/>{l.name}{l.tracks.includes(track.id)?' ✓':''}</button>)}
   {!creating?<button onClick={()=>setCreating(true)}><Plus size={17}/> Utwórz playlistę</button>:<form className="library-track-create" onSubmit={e=>{e.preventDefault();if(name.trim()){playlists.create(name,track.id);setName('');setCreating(false);setOpen(false)}}}><input autoFocus aria-label="Nazwa playlisty" value={name} onChange={e=>setName(e.target.value)} placeholder="Nazwa playlisty"/><button type="submit" disabled={!name.trim()}>Dodaj</button></form>}
   <div className="library-track-divider"/>
   <button className="library-track-danger" onClick={()=>{onRemove(track.id);setOpen(false)}}><Trash2 size={17}/> Usuń z biblioteki</button>
  </div>}
 </div>
}
