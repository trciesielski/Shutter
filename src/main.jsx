import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { House, Library, ListMusic, Search, Settings, CarFront, Music2, Heart, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat2, Volume2, Moon, Sun, Monitor, ChevronRight, Headphones, Disc3, Plus, Menu, X, Compass, ArrowUpRight, Laptop, Clock3 } from 'lucide-react';
import './style.css';
import GlassEngine from './glass/GlassEngine.jsx';
import PlayerGlass from './glass/PlayerGlass.jsx';
import {registerPWA} from './pwa.js';
import {useAudioEngine} from './audio/useAudioEngine.js';
import EqualizerPanel from './audio/EqualizerPanel.jsx';
import LocalPlaylists from './audio/LocalPlaylists.jsx';
import LibraryTrack from './audio/LibraryTrack.jsx';
import {usePlaylists} from './audio/usePlaylists.js';

const songs = [
 {id:1,title:'Midnight Drive',artist:'VELNOIR',album:'Human Anomaly',duration:'3:42',art:'night',tag:'Atmospheric'},
 {id:2,title:'Beyond the Silence',artist:'VELNOIR',album:'Human Anomaly',duration:'4:10',art:'violet',tag:'Electronic'},
 {id:3,title:'Ocean Inside',artist:'VELNOIR',album:'Echoes',duration:'3:26',art:'ocean',tag:'Ambient'},
 {id:4,title:'Afterglow',artist:'VELNOIR',album:'Human Anomaly',duration:'3:58',art:'orange',tag:'Downtempo'},
 {id:5,title:'Parallel Worlds',artist:'VELNOIR',album:'Echoes',duration:'4:24',art:'blue',tag:'Cinematic'}
];
const views = [{id:'home',label:'Start',Icon:House},{id:'library',label:'Biblioteka',Icon:Library},{id:'playlists',label:'Playlisty',Icon:ListMusic},{id:'search',label:'Szukaj',Icon:Search},{id:'eq',label:'Equalizer',Icon:Disc3},{id:'glass',label:'Glass Engine',Icon:Disc3},{id:'car',label:'Car Preview',Icon:CarFront},{id:'settings',label:'Ustawienia',Icon:Settings}];
function cover(art,extra=''){return <div className={`cover cover-${art} ${extra}`}><div className="cover-orb"/><div className="cover-horizon"/></div>}
function App(){
 const audio=useAudioEngine();
 const playlists=usePlaylists();
 const [source,setSource]=useState('demo');
 const [view,setView]=useState('home'),[current,setCurrent]=useState(0),[playing,setPlaying]=useState(false),[likes,setLikes]=useState([1,3]),[theme,setTheme]=useState('auto'),[query,setQuery]=useState(''),[mobileMenu,setMobileMenu]=useState(false),[progress,setProgress]=useState(34);
 const durationSeconds = songDuration => {const parts=songDuration.split(':').map(Number);return parts.reduce((a,n)=>a*60+n,0)};
 const formatClock = seconds => {const n=Math.max(0,Math.floor(seconds));const h=Math.floor(n/3600),m=Math.floor(n%3600/60),sec=n%60;return h?String(h)+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0')};
 const [systemDark,setSystemDark]=useState(()=>window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
 useEffect(()=>{const m=window.matchMedia('(prefers-color-scheme: dark)');const fn=e=>setSystemDark(e.matches);m.addEventListener('change',fn);return()=>m.removeEventListener('change',fn)},[]);
 const dark=theme==='auto'?systemDark:theme==='dark';
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light'},[dark]);
 const isLocal=source==='local'&&audio.files.length>0;
 const song=isLocal?audio.files[audio.index]:songs[current];
 const totalSeconds=isLocal?audio.duration:durationSeconds(song.duration);
 const currentSeconds=isLocal?audio.seconds:Math.round(progress/100*totalSeconds);
 useEffect(()=>{if(isLocal||!playing)return;const timer=setInterval(()=>setProgress(v=>Math.min(100,v+100/Math.max(1,totalSeconds))),1000);return()=>clearInterval(timer)},[playing,totalSeconds,isLocal]);
 useEffect(()=>{if(progress>=100&&playing)setPlaying(false)},[progress,playing]);
 const next=()=>{if(isLocal){audio.next();return}setCurrent(v=>(v+1)%songs.length);setProgress(0)},prev=()=>{if(isLocal){audio.prev();return}setCurrent(v=>(v-1+songs.length)%songs.length);setProgress(0)};
 const choose=(idx)=>{setSource('demo');audio.stop();setCurrent(idx);setPlaying(true);setProgress(0)};
 const chooseLocal=(idx)=>{setPlaying(false);setSource('local');audio.select(idx)};
 const importLocal=(files)=>{audio.importFiles(files);setView('library')};
 const activePlaying=isLocal?audio.state==='playing':playing;
 const playToggle=()=>{if(isLocal){audio.toggle();return}if(progress>=100)setProgress(0);setPlaying(v=>!v)};
 const seekTo=(value)=>{if(isLocal)audio.seek(value);else setProgress(value)};
 const toggleLike=id=>setLikes(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
 const nav=id=>{setView(id);setMobileMenu(false)};
 const track=(s)=> <button key={s.id} className={`song-row ${song.id===s.id?'selected':''}`} onClick={()=>choose(songs.findIndex(x=>x.id===s.id))}>{cover(s.art,'track-art')}<span className="song-meta"><strong>{s.title}</strong><small>{s.artist} · {s.album}</small></span><span className="song-duration">{s.duration}</span><ChevronRight size={16}/></button>;
 return <div className="app-shell"><svg aria-hidden="true" width="0" height="0" style={{position:"absolute",pointerEvents:"none"}}><defs><filter id="shutter-lens" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.016 0.035" numOctaves="2" seed="8" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>
 <aside className={`sidebar ${mobileMenu?'open':''}`}>
  <div className="brand"><div className="brand-mark"><span/><span/><span/><span/></div><span>shutter<span className="brand-dot">.</span></span><button className="menu-close" onClick={()=>setMobileMenu(false)} aria-label="Zamknij menu"><X size={19}/></button></div>
  <div className="side-label">ODKRYWAJ</div><nav>{views.slice(0,4).map(({id,label,Icon})=><button key={id} className={view===id?'nav-active':''} onClick={()=>nav(id)}><Icon size={19}/><span>{label}</span>{view===id&&<span className="nav-dot"/>}</button>)}</nav>
  <div className="side-label section-gap">TWOJA PRZESTRZEŃ</div><nav>{views.slice(4).map(({id,label,Icon})=><button key={id} className={view===id?'nav-active':''} onClick={()=>nav(id)}><Icon size={19}/><span>{label}</span></button>)}</nav>
  <div className="sidebar-bottom"><div className="mini-disc"><Disc3 size={27}/></div><div><strong>Shutter Music</strong><small>Twój świat dźwięku</small></div></div>
 </aside>
 {mobileMenu&&<button className="shade" aria-label="Zamknij nawigację" onClick={()=>setMobileMenu(false)}/>}
 <main className="main">
 <header className="topbar"><button className="hamburger" aria-label="Otwórz menu" onClick={()=>setMobileMenu(true)}><Menu size={22}/></button><div className="breadcrumb">SHUTTER <span>/</span> {views.find(x=>x.id===view)?.label.toUpperCase()}</div><div className="top-actions"><span className="status-pill"><span/> GLASS ENGINE · 01</span><button className="icon-button" onClick={()=>setTheme(dark?'light':'dark')} aria-label="Przełącz motyw">{dark?<Sun size={18}/>:<Moon size={18}/>}</button><div className="avatar">S</div></div></header>
 <div className="page-content">
 {view==='home'&&<><section className="hero"><div className="hero-content"><div className="eyebrow"><span className="live-dot"/> TWOJA MUZYKA. TWOJE ZASADY.</div><h1>Dźwięk, który<br/><em>zostaje z Tobą.</em></h1><p>Twoja kolekcja w jednym miejscu. Słuchaj tak, jak lubisz — bez rozpraszania.</p><button className="primary-button" onClick={()=>choose(0)}><Play size={17} fill="currentColor"/> Odtwórz teraz</button></div><div className="hero-music-art" aria-hidden="true"><ListMusic className="hero-glyph glyph-playlist"/><Music2 className="hero-glyph glyph-note"/><Headphones className="hero-glyph glyph-headphones"/><Disc3 className="hero-glyph glyph-album"/><Heart className="hero-glyph glyph-heart"/><Volume2 className="hero-glyph glyph-wave"/><Search className="hero-glyph glyph-search"/><Library className="hero-glyph glyph-library"/></div></section>
 <div className="section-heading"><div><span className="eyebrow muted">WYBRANE DLA CIEBIE</span><h2>Twoje brzmienie</h2></div><button onClick={()=>nav('library')}>Zobacz wszystko <ArrowUpRight size={16}/></button></div>
 <div className="album-grid">{[{name:'Night Sessions',description:'Zanurz się w dźwięku',art:'night'},{name:'Human Anomaly',description:'VELNOIR · Album',art:'violet'},{name:'Slow Motion',description:'Spokojniejsze chwile',art:'ocean'},{name:'Golden Hours',description:'Energia na wieczór',art:'orange'}].map((a,i)=><button className="album-card" key={a.name} onClick={()=>choose(i)}>{cover(a.art,'album-cover')}<strong>{a.name}</strong><small>{a.description}</small></button>)}</div>
 <div className="section-heading compact"><div><h2>Ostatnio słuchane</h2></div><button onClick={()=>nav('library')}>Biblioteka <ArrowUpRight size={16}/></button></div><div className="track-list">{songs.slice(0,4).map(track)}</div></>}
 {view==='library'&&<><div className="page-heading"><span className="eyebrow muted">TWOJA KOLEKCJA</span><h1>Biblioteka</h1><p>Wszystkie utwory w jednym miejscu.</p></div><div className="content-card"><div className="card-title"><h2>Utwory</h2><span>{songs.length} utworów demonstracyjnych</span></div><div className="local-import"><label className="primary-button import-button"><Plus size={17}/> Dodaj pliki muzyczne<input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus" multiple onChange={e=>{importLocal(e.target.files);e.target.value=''}}/></label><small>Pliki pozostają na Twoim urządzeniu. Zapisywane lokalnie na tym urządzeniu (IndexedDB).</small></div>{audio.error&&<p className="audio-error" role="alert">{audio.error}</p>}{audio.files.length>0&&<><div className="card-title"><h2>Moje pliki</h2><span>{audio.files.length}</span></div><div className="track-list">{audio.files.map((f,i)=><LibraryTrack key={f.id} track={f} index={i} active={isLocal&&audio.index===i} playing={isLocal&&audio.index===i&&audio.state==='playing'} onPlay={chooseLocal} onToggle={audio.toggle} onRemove={audio.remove} playlists={playlists}/>)}</div></>}<div className="card-title"><h2>Utwory demonstracyjne</h2></div><div className="track-list">{songs.map(track)}</div></div></>}
 {view==='playlists'&&<><div className="page-heading"><span className="eyebrow muted">TWOJA KOLEKCJA</span><h1>Playlisty</h1><p>Muzyka dopasowana do Twoich chwil.</p></div><div className="album-grid playlist-grid">{[{name:'Night Sessions',art:'night'},{name:'Chill Vibes',art:'ocean'},{name:'On The Road',art:'blue'}].map((a,i)=><button className="album-card" key={a.name} onClick={()=>choose(i)}>{cover(a.art,'album-cover')}<strong>{a.name}</strong><small>Playlista demonstracyjna</small></button>)}</div><LocalPlaylists tracks={audio.files} onPlay={chooseLocal} onToggle={audio.toggle} activeId={isLocal?audio.files[audio.index]?.id:null} isPlaying={isLocal&&audio.state==='playing'} playlists={playlists}/></>}
 {view==='search'&&<><div className="page-heading"><span className="eyebrow muted">ZNAJDŹ SWÓJ RYTM</span><h1>Szukaj muzyki</h1><p>Przeszukaj demonstracyjną bibliotekę.</p></div><label className="search-field"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tytuł, artysta lub album…"/></label><div className="content-card"><div className="card-title"><h2>Wyniki</h2></div><div className="track-list">{songs.filter(s=>[s.title,s.artist,s.album].some(x=>x.toLowerCase().includes(query.toLowerCase()))).map(track)}</div></div></>}
 {view==='settings'&&<><div className="page-heading"><span className="eyebrow muted">TWÓJ STYL</span><h1>Ustawienia</h1><p>Dostosuj Shutter do siebie.</p></div><div className="content-card settings-card"><h2>Wygląd aplikacji</h2><p>Wybierz motyw. Automatyczny podąża za ustawieniem systemu.</p><div className="theme-options">{[{id:'light',label:'Jasny',Icon:Sun},{id:'dark',label:'Ciemny',Icon:Moon},{id:'auto',label:'Automatyczny',Icon:Monitor}].map(({id,label,Icon})=><button className={theme===id?'theme-selected':''} onClick={()=>setTheme(id)} key={id}><Icon size={26}/><strong>{label}</strong><span>{theme===id?'●':'○'}</span></button>)}</div></div><div className="content-card settings-card"><h2>Platformy</h2><p>Ten etap to prototyp UI. Odtwarzanie prawdziwych plików, aplikacje natywne i Android Auto będą dodawane osobno.</p><div className="platform-chips"><span><Headphones size={16}/> Android</span><span><Laptop size={16}/> macOS</span><span><CarFront size={16}/> Android Auto — planowane</span></div></div></>}
 {view==='eq'&&<EqualizerPanel eq={audio.eq}/>}
 {view==='glass'&&<GlassEngine/>}
 {view==='car'&&<><div className="page-heading"><span className="eyebrow muted">PROJEKT EKRANU SAMOCHODOWEGO</span><h1>Car Preview</h1><p>Podgląd wizualny. Faktyczny ekran Android Auto jest kontrolowany przez system i wymaga osobnej integracji Media3.</p></div><div className="car-frame"><div className="car-header"><strong><Music2 size={21}/> shutter.</strong><span><Clock3 size={16}/> 09:41</span></div><div className="car-body"><div className="car-cover-wrap">{cover(song.art,'car-cover')}</div><div className="car-now"><span>TERAZ ODTWARZANE</span><h2>{song.title}</h2><p>{song.artist}</p><div className="car-controls"><button aria-label="Poprzedni" onClick={prev}><SkipBack fill="currentColor"/></button><button className="car-play" aria-label={playing?'Pauza':'Odtwórz'} onClick={()=>setPlaying(v=>!v)}>{playing?<span className="pause-audio-pulse" aria-hidden="true"><span/><span/></span>:<Play fill="currentColor"/>}</button><button aria-label="Następny" onClick={next}><SkipForward fill="currentColor"/></button></div></div><div className="car-queue"><strong>NASTĘPNE</strong>{songs.filter(s=>s.id!==song.id).slice(0,3).map(s=><div key={s.id}><span>{s.title}</span><small>{s.artist}</small></div>)}</div></div></div><div className="car-note">Wersja koncepcyjna — nie jest interfejsem zatwierdzonym ani renderowanym przez Android Auto.</div></>}
 </div>
 </main>
 <PlayerGlass><div className="player-bar player-bar-v5">
   <div className="player-song"><div className="player-song-meta"><strong>{song.title}</strong><small>{song.artist} · {song.album}</small></div></div>
   <div className="player-middle">
    <div className="progress-line"><span>{formatClock(currentSeconds)}</span><input type="range" min="0" max="100" step=".1" value={isLocal?(totalSeconds>0?audio.seconds/totalSeconds*100:0):progress} onChange={e=>seekTo(Number(e.target.value))} aria-label="Pozycja utworu" style={{"--seek-progress":`${isLocal&&totalSeconds>0?audio.seconds/totalSeconds*100:progress}%`}}/><span>{formatClock(totalSeconds)}</span></div>
    <div className="player-controls">
     <button aria-label="Poprzedni" onClick={prev}><SkipBack fill="currentColor"/></button>
     <button aria-label={activePlaying?'Pauza':'Odtwórz'} className={`play-button ${activePlaying?"is-playing":""}`} onClick={playToggle}>{activePlaying?<span className="pause-audio-pulse" aria-hidden="true"><span/><span/></span>:<Play fill="currentColor"/>}</button>
     <button aria-label="Następny" onClick={next}><SkipForward fill="currentColor"/></button>
    </div>
    <div className="playback-state"><span className={activePlaying?'state-dot active':'state-dot'}/>{isLocal?(audio.state==='playing'?'ODTWARZANIE':audio.state==='loading'?'ŁADOWANIE':audio.state==='error'?'BŁĄD':audio.state==='stopped'?'ZATRZYMANO':'PAUZA'):(playing?'ODTWARZANIE · DEMO':progress>=100?'ZATRZYMANO · DEMO':'PAUZA · DEMO')}</div>
   </div>
   <div className="player-right"><Volume2 size={18}/><input type="range" aria-label="Głośność demonstracyjna" value={Math.round(audio.volume*100)} onChange={e=>audio.setGain(Number(e.target.value)/100)}/><span className="quality">SHUTTER</span></div>
  </div></PlayerGlass>
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
registerPWA();
