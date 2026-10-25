import React,{useState} from 'react';
export default function LocalPlaylists({tracks,onPlay,playlists}){
 const [name,setName]=useState('');
 const {lists,create,toggleTrack,remove}=playlists;
 return <section className="local-playlists">
  <div className="playlist-new"><input aria-label="Nazwa nowej playlisty" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){create(name);setName('')}}} placeholder="Nazwa nowej playlisty"/><button onClick={()=>{create(name);setName('')}} disabled={!name.trim()}>Utwórz playlistę</button></div>
  {lists.length===0&&<p className="playlist-hint">Utwórz pierwszą playlistę albo dodaj utwór do Ulubionych.</p>}
  {lists.map(list=><div key={list.id} className="playlist-user-card">
   <div className="playlist-user-heading"><strong>{list.name}</strong><span>{list.tracks.length} utworów</span><button aria-label={'Usuń playlistę '+list.name} onClick={()=>remove(list.id)}>Usuń</button></div>
   {tracks.filter(track=>list.tracks.includes(track.id)).map(track=><div key={track.id} className="playlist-track-option"><span>{track.title}</span><button type="button" onClick={()=>onPlay(tracks.findIndex(t=>t.id===track.id))}>Odtwórz</button><button type="button" onClick={()=>toggleTrack(list.id,track.id)} aria-label={'Usuń '+track.title+' z '+list.name}>Usuń z listy</button></div>)}
   {!list.tracks.length&&<p className="playlist-hint">Ta playlista jest pusta. Dodaj utwór z Biblioteki.</p>}
  </div>)}
  <p className="playlist-hint">Playlisty zapisujemy lokalnie w tej przeglądarce.</p>
 </section>;
}
