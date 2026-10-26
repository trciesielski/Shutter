import React,{useState,useRef,useEffect} from 'react';
import {MoreVertical,Heart,Plus,ListPlus,Play,Pause,Trash2,ThumbsUp,ThumbsDown,Share2} from 'lucide-react';
import {getTrackRating,setTrackRating} from './trackPreferences.js';
import {shareTrack} from './shareTrack.js';

const shareMessages={
 shared:'Udostępniono',
 copied:'Skopiowano publiczny link',
 cancelled:'Anulowano',
 unavailable:'Brak publicznego linku dla pliku lokalnego'
};

export default function LibraryTrack({track,index,active,playing,onPlay,onToggle,onRemove,onPlayNext,playlists}){
 const [open,setOpen]=useState(false),[creating,setCreating]=useState(false),[name,setName]=useState('');
 const [rating,setRating]=useState(()=>getTrackRating(track.id));
 const [shareNotice,setShareNotice]=useState('');
 const ref=useRef(null),shareTimer=useRef(null);
 const [artUrl,setArtUrl]=useState(null);
 useEffect(()=>{if(!track.coverBlob)return;const url=URL.createObjectURL(track.coverBlob);setArtUrl(url);return()=>URL.revokeObjectURL(url)},[track.coverBlob]);
 useEffect(()=>{setRating(getTrackRating(track.id));setShareNotice('');return()=>clearTimeout(shareTimer.current)},[track.id]);
 useEffect(()=>{if(!open)return;const close=e=>{if(!ref.current?.contains(e.target))setOpen(false)};const esc=e=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('pointerdown',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',esc)}},[open]);
 const favorite=playlists.isFavorite(track.id);
 const play=()=>active?onToggle():onPlay(index);
 const rate=value=>setRating(setTrackRating(track.id,rating===value?null:value));
 const share=async()=>{const result=await shareTrack(track);setShareNotice(shareMessages[result]);clearTimeout(shareTimer.current);shareTimer.current=setTimeout(()=>setShareNotice(''),2200)};
 return <div className={'library-track '+(active?'selected':'')} ref={ref}>
  <button className="library-track-main" onClick={play} aria-label={'Odtwórz utwór '+track.title}>
   <span className="library-track-art" aria-hidden="true">{artUrl&&<img src={artUrl} alt="" className="library-track-cover-image"/>}<span className="library-cover-play">{active&&playing?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</span></span>
  </button>
  <div className="library-track-details">
   <button className="library-track-copy" onClick={play} aria-label={'Odtwórz utwór '+track.title}>
    <strong title={track.title}>{track.title}</strong><small title={track.artist||'Plik lokalny'}>{track.artist||'Plik lokalny'}</small>
   </button>
   <div className="library-track-actions" role="group" aria-label={'Akcje dla '+track.title}>
    <button type="button" className={'library-track-action '+(favorite?'is-active':'')} aria-label={favorite?'Usuń z ulubionych':'Dodaj do ulubionych'} aria-pressed={favorite} onClick={()=>playlists.ensureFavorite(track.id)}><Heart size={14} fill={favorite?'currentColor':'none'}/></button>
    <button type="button" className={'library-track-action '+(rating==='up'?'is-active is-positive':'')} aria-label="Oceń pozytywnie" aria-pressed={rating==='up'} onClick={()=>rate('up')}><ThumbsUp size={14} fill={rating==='up'?'currentColor':'none'}/></button>
    <button type="button" className={'library-track-action '+(rating==='down'?'is-active is-negative':'')} aria-label="Oceń negatywnie" aria-pressed={rating==='down'} onClick={()=>rate('down')}><ThumbsDown size={14} fill={rating==='down'?'currentColor':'none'}/></button>
    <button type="button" className="library-track-action" aria-label={'Udostępnij '+track.title} onClick={share}><Share2 size={14}/></button>
    <button type="button" className="library-track-action library-track-menu-trigger" aria-label={'Więcej akcji dla '+track.title} onClick={()=>setOpen(x=>!x)} aria-expanded={open}><MoreVertical size={16}/></button>
   </div>
  </div>
  {shareNotice&&<span className="library-track-share-status" role="status" aria-live="polite">{shareNotice}</span>}
  {open&&<div className="library-track-popover" role="group" aria-label={'Więcej akcji dla '+track.title}>
   <button onClick={()=>{onPlay(index);setOpen(false)}}><Play size={17}/> Odtwórz</button>
   {onPlayNext&&<button onClick={()=>{onPlayNext(track.id);setOpen(false)}}><ListPlus size={17}/> Odtwórz jako następny</button>}
   <button onClick={()=>{playlists.ensureFavorite(track.id);setOpen(false)}}><Heart size={17} fill={favorite?'currentColor':'none'}/>{favorite?'Usuń z Ulubionych':'Dodaj do Ulubionych'}</button>
   <div className="library-track-divider"/>
   <span className="library-track-menu-caption">Dodaj do playlisty</span>
   {playlists.lists.filter(l=>l.id!=='shutter-favorites').map(l=><button key={l.id} disabled={l.tracks.includes(track.id)} onClick={()=>{playlists.addTrack(l.id,track.id);setOpen(false)}}><ListPlus size={17}/>{l.name}{l.tracks.includes(track.id)?' ✓':''}</button>)}
   {!creating?<button onClick={()=>setCreating(true)}><Plus size={17}/> Utwórz playlistę</button>:<form className="library-track-create" onSubmit={e=>{e.preventDefault();if(name.trim()){playlists.create(name,track.id);setName('');setCreating(false);setOpen(false)}}}><input autoFocus aria-label="Nazwa playlisty" value={name} onChange={e=>setName(e.target.value)} placeholder="Nazwa playlisty"/><button type="submit" disabled={!name.trim()}>Dodaj</button></form>}
   <div className="library-track-divider"/>
   <button className="library-track-danger" onClick={()=>{onRemove(track.id);setOpen(false)}}><Trash2 size={17}/> Usuń z biblioteki</button>
  </div>}
 </div>
}
