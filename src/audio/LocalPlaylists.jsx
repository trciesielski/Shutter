import {useEffect,useState} from 'react';
const KEY='shutter-user-playlists-v1';
function load(){try{const data=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(data)?data.filter(x=>typeof x.id==='string'&&Array.isArray(x.tracks)):[]}catch{return []}}
export default function LocalPlaylists({tracks,onPlay}){
 const [lists,setLists]=useState(load),[name,setName]=useState(''),[selected,setSelected]=useState('');
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(lists))}catch{}},[lists]);
 const add=()=>{const n=name.trim();if(!n)return;setLists(p=>p.concat({id:crypto.randomUUID?.()||String(Date.now()),name:n,tracks:[]}));setName('')};
 const toggle=(id,trackId)=>setLists(p=>p.map(x=>x.id===id?{...x,tracks:x.tracks.includes(trackId)?x.tracks.filter(y=>y!==trackId):x.tracks.concat(trackId)}:x));
 return <section className="local-playlists">
  <div className="playlist-new"><input aria-label="Nazwa nowej playlisty" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Nazwa nowej playlisty"/><button onClick={add} disabled={!name.trim()}>Utwórz playlistę</button></div>
  {lists.length===0&&<p className="playlist-hint">Utwórz pierwszą playlistę i dodaj do niej utwory z biblioteki.</p>}
  {lists.map(list=><div key={list.id} className="playlist-user-card">
   <div className="playlist-user-heading"><strong>{list.name}</strong><span>{list.tracks.length} utworów</span><button aria-label={'Usuń playlistę '+list.name} onClick={()=>setLists(p=>p.filter(x=>x.id!==list.id))}>Usuń</button></div>
   {tracks.map((track,i)=><label key={track.id} className="playlist-track-option"><input type="checkbox" checked={list.tracks.includes(track.id)} onChange={()=>toggle(list.id,track.id)}/><span>{track.title}</span><button type="button" onClick={()=>onPlay(i)}>Odtwórz</button></label>)}
   {!tracks.length&&<p className="playlist-hint">Najpierw dodaj pliki muzyczne w Bibliotece.</p>}
  </div>)}
  <p className="playlist-hint">Playlisty są zapisane w tej przeglądarce. Pliki muzyczne przechowuje lokalna baza IndexedDB.</p>
 </section>
}
