import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { House, Library, ListMusic, Search, Settings, CarFront, Music2, Heart, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat2, Volume2, Moon, Sun, Monitor, ChevronRight, Headphones, Disc3, Plus, Menu, X, Compass, ArrowUpRight, Laptop, Clock3 } from 'lucide-react';
import './style.css';
import './audio/SidebarScroll.css';
import {useGlassLook} from './glass/useGlassLook.js';
import PlayerGlass from './glass/PlayerGlass.jsx';
import MusicVisualizer from './visualizer/MusicVisualizer.jsx';
import {registerPWA} from './pwa.js';
import {useAudioEngine} from './audio/useAudioEngine.js';
import EqualizerPanel from './audio/EqualizerPanel.jsx';
import LocalPlaylists from './audio/LocalPlaylists.jsx';
import LibraryTrack from './audio/LibraryTrack.jsx';
import {usePlaylists} from './audio/usePlaylists.js';

const views = [{id:'home',label:'Start',Icon:House},{id:'library',label:'Biblioteka',Icon:Library},{id:'playlists',label:'Playlisty',Icon:ListMusic},{id:'search',label:'Szukaj',Icon:Search},{id:'eq',label:'Equalizer',Icon:Disc3},{id:'history',label:'Historia',Icon:Clock3},{id:'car',label:'Car Preview',Icon:CarFront},{id:'settings',label:'Ustawienia',Icon:Settings}];
function cover(art,extra=''){return <div className={`cover cover-${art} ${extra}`}><div className="cover-orb"/><div className="cover-horizon"/></div>}
function CatalogNotice({catalog,empty,onRetry}){
 if(catalog.status==='loading')return <p className="shutter-empty" role="status">Wczytywanie katalogu muzyki…</p>;
 if(catalog.status==='error')return <div className="shutter-empty" role="alert">{catalog.error?.message||'Nie można wczytać katalogu muzyki.'} <button type="button" className="catalog-retry" onClick={onRetry}>Spróbuj ponownie</button></div>;
 if(catalog.status==='empty'||empty)return <p className="shutter-empty">Katalog muzyki jest jeszcze pusty.</p>;
 if(catalog.skipped?.length)return <p className="shutter-empty" role="status">Pominięto pozycje katalogu z nieprawidłowymi danymi lub nieobsługiwanym formatem: {catalog.skipped.length}.</p>;
 return null;
}
function App(){
 const audio=useAudioEngine();
 const playlists=usePlaylists({ready:audio.nativeReady});
 const caps=audio.capabilities;
 const emptyHint=caps.localImport?'Dodaj muzykę':'Wybierz utwór z katalogu';
 const catalogNotice=<CatalogNotice catalog={audio.catalog} empty={!audio.files.length} onRetry={audio.reloadCatalog}/>;
 const glass=useGlassLook();

 const [playerExpanded,setPlayerExpanded]=useState(false);
 const [seekPreview,setSeekPreview]=useState(null);
 const [playerListId,setPlayerListId]=useState(null);
 const [queueSource,setQueueSource]=useState(null);
 const [view,setView]=useState('home'),[theme,setTheme]=useState('auto'),[query,setQuery]=useState(''),[mobileMenu,setMobileMenu]=useState(false);
 const durationSeconds = songDuration => {const parts=songDuration.split(':').map(Number);return parts.reduce((a,n)=>a*60+n,0)};
 const formatClock = seconds => {const n=Math.max(0,Math.floor(seconds));const h=Math.floor(n/3600),m=Math.floor(n%3600/60),sec=n%60;return h?String(h)+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0')};
 const [systemDark,setSystemDark]=useState(()=>window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
 useEffect(()=>{const m=window.matchMedia('(prefers-color-scheme: dark)');const fn=e=>setSystemDark(e.matches);m.addEventListener('change',fn);return()=>m.removeEventListener('change',fn)},[]);
 const dark=theme==='auto'?systemDark:theme==='dark';
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light'},[dark]);
 const song=audio.files[audio.index]||null;
 const isLocal=Boolean(song);
 const matchingPlaylists=song?playlists.lists.filter(list=>list.tracks.includes(song.id)):[];
 const selectedPlayerList=matchingPlaylists.find(list=>list.id===playerListId)||matchingPlaylists[0]||null;
 const playlistQueue=selectedPlayerList?selectedPlayerList.tracks.map(id=>audio.files.find(f=>f.id===id)).filter(Boolean):[];
 const activePlaylist=playlists.lists.find(x=>x.id===queueSource)||null;
 const activeQueue=audio.queueIds.map(id=>audio.files.find(f=>f.id===id)).filter(Boolean);
 const activatePlaylist=list=>{setPlayerListId(list.id);setQueueSource(list.id);audio.loadQueue(list.tracks)};
 const totalSeconds=isLocal?audio.duration:0;
 const currentSeconds=isLocal?audio.seconds:0;
 const next=()=>audio.next(),prev=()=>audio.prev();
 const chooseLocal=idx=>audio.select(idx);
 const importLocal=files=>{if(!audio.importFiles)return;audio.importFiles(files);setView('library')};
 const activePlaying=audio.state==='playing';
 const playToggle=()=>audio.toggle();
 const seekTo=value=>{audio.seek(value);setSeekPreview(null)};
 const seekPercent=seekPreview??(totalSeconds>0?Math.min(100,Math.max(0,currentSeconds/totalSeconds*100)):0);
 const nav=id=>{setView(id);setMobileMenu(false)};
 return <div className="app-shell"><svg aria-hidden="true" width="0" height="0" style={{position:"absolute",pointerEvents:"none"}}><defs><filter id="shutter-lens" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.016 0.035" numOctaves="2" seed="8" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>
 <aside className={`sidebar ${mobileMenu?'open':''}`}>
  <div className="brand"><div className="brand-mark"><span/><span/><span/><span/></div><span>shutter<span className="brand-dot">.</span></span><button className="menu-close" onClick={()=>setMobileMenu(false)} aria-label="Zamknij menu"><X size={19}/></button></div>
  <div className="sidebar-scroll" role="region" aria-label="Menu nawigacyjne" tabIndex={0}>
  <div className="side-label">ODKRYWAJ</div><nav>{views.slice(0,4).map(({id,label,Icon})=><button key={id} className={view===id?'nav-active':''} onClick={()=>nav(id)}><Icon size={19}/><span>{label}</span>{view===id&&<span className="nav-dot"/>}</button>)}</nav>
  <div className="side-label section-gap">TWOJA PRZESTRZEŃ</div><nav>{views.slice(4).map(({id,label,Icon})=><button key={id} className={view===id?'nav-active':''} onClick={()=>nav(id)}><Icon size={19}/><span>{label}</span></button>)}</nav>
  </div>
  <div className="sidebar-bottom"><div className="mini-disc"><Disc3 size={27}/></div><div><strong>Shutter Music</strong><small>Twój świat dźwięku</small></div></div>
 </aside>
 {mobileMenu&&<button className="shade" aria-label="Zamknij nawigację" onClick={()=>setMobileMenu(false)}/>}
 <main className="main">
 <header className="topbar"><button className="hamburger" aria-label="Otwórz menu" onClick={()=>setMobileMenu(true)}><Menu size={22}/></button><div className="breadcrumb">SHUTTER <span>/</span> {views.find(x=>x.id===view)?.label.toUpperCase()}</div><div className="top-actions"><span className="status-pill"><span/> GLASS ENGINE · 01</span><button className="icon-button" onClick={()=>setTheme(dark?'light':'dark')} aria-label="Przełącz motyw">{dark?<Sun size={18}/>:<Moon size={18}/>}</button><div className="avatar">S</div></div></header>
 <div className="page-content">
 <MusicVisualizer visible={view==='home'} song={song} playing={activePlaying} bins={audio.eq.bins} signalStatus={audio.eq.signalStatus} signalDebug={audio.eq.signalDebug}/>
 {view==='home'&&<>
 <div className="section-heading"><div><span className="eyebrow muted">TWOJA KOLEKCJA</span><h2>Twoje playlisty</h2></div><button onClick={()=>nav('playlists')}>Zobacz wszystkie <ArrowUpRight size={16}/></button></div>
 {playlists.lists.length?<div className="album-grid">{playlists.lists.map((list,i)=><button className="album-card" key={list.id} onClick={()=>nav('playlists')}>{cover(['night','violet','ocean','orange'][i%4],'album-cover')}<strong>{list.name}</strong><small>{list.tracks.length} utworów</small></button>)}</div>:<p className="shutter-empty">{caps.localImport?'Nie masz jeszcze playlist. Utwórz je z własnej muzyki.':'Nie masz jeszcze playlist. Utwórz je z utworów katalogu.'}</p>}
 <div className="section-heading compact"><div><h2>Twoje utwory</h2></div><button onClick={()=>nav('library')}>Biblioteka <ArrowUpRight size={16}/></button></div>
 {audio.files.length?<div className="track-list">{audio.files.slice(0,4).map((f,i)=><LibraryTrack key={f.id} track={f} index={i} active={song?.id===f.id} playing={song?.id===f.id&&activePlaying} onPlay={chooseLocal} onToggle={audio.toggle} onRemove={audio.remove} onPlayNext={audio.addNext} playlists={playlists}/>)}</div>:caps.publicCatalog?catalogNotice:<p className="shutter-empty">Twoja biblioteka jest pusta. Dodaj pierwsze pliki muzyczne.</p>}</>}
 {view==='library'&&<><div className="page-heading"><span className="eyebrow muted">TWOJA KOLEKCJA</span><h1>Biblioteka</h1><p>Wszystkie utwory w jednym miejscu.</p></div><div className="content-card"><div className="card-title"><h2>Utwory</h2><span>{audio.files.length} utworów</span></div>{caps.nativePlayback?<div className="local-import"><button className="primary-button" onClick={()=>importLocal()}><Plus size={17}/> Dodaj pliki muzyczne</button><small>Pliki pozostają na Twoim urządzeniu.</small></div>:caps.localImport?<div className="local-import"><label className="primary-button import-button"><Plus size={17}/> Dodaj pliki muzyczne<input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus" multiple onChange={e=>{importLocal(e.target.files);e.target.value=''}}/></label><small>Pliki pozostają na Twoim urządzeniu. Zapisywane lokalnie na tym urządzeniu (IndexedDB).</small></div>:catalogNotice}{audio.error&&<p className="audio-error" role="alert">{audio.error} {caps.nativePlayback&&<button type="button" onClick={audio.reloadCatalog}>Spróbuj ponownie</button>}</p>}{audio.files.length>0&&<><div className="card-title"><h2>{caps.localImport?'Moje pliki':'Katalog'}</h2><span>{audio.files.length}</span></div><div className="track-list">{audio.files.map((f,i)=><LibraryTrack key={f.id} track={f} index={i} active={isLocal&&audio.index===i} playing={isLocal&&audio.index===i&&audio.state==='playing'} onPlay={chooseLocal} onToggle={audio.toggle} onRemove={audio.remove} onPlayNext={audio.addNext} playlists={playlists}/>)}</div></>}</div></>}
 {view==='playlists'&&<><div className="page-heading"><span className="eyebrow muted">TWOJA KOLEKCJA</span><h1>Playlisty</h1><p>Muzyka dopasowana do Twoich chwil.</p></div>{playlists.error&&<p className="audio-error" role="alert">{playlists.error}</p>}<LocalPlaylists tracks={audio.files} onPlay={chooseLocal} onPlaylistPlay={(list,id)=>{activatePlaylist(list);const idx=audio.files.findIndex(f=>f.id===id);if(idx>=0)chooseLocal(idx)}} onToggle={audio.toggle} activeId={isLocal?audio.files[audio.index]?.id:null} isPlaying={isLocal&&audio.state==='playing'} playlists={playlists}/></>}
 {view==='search'&&<><div className="page-heading"><span className="eyebrow muted">ZNAJDŹ SWÓJ RYTM</span><h1>Szukaj muzyki</h1><p>{caps.localImport?'Przeszukaj własną bibliotekę.':'Przeszukaj katalog SHUTTER.'}</p></div><label className="search-field"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tytuł lub wykonawca…"/></label><div className="content-card"><div className="card-title"><h2>Wyniki</h2></div><div className="track-list">{audio.files.map((f,i)=>({...f,idx:i})).filter(f=>[f.title,f.artist,f.album].some(x=>String(x||'').toLowerCase().includes(query.toLowerCase()))).map(f=><LibraryTrack key={f.id} track={f} index={f.idx} active={song?.id===f.id} playing={song?.id===f.id&&activePlaying} onPlay={chooseLocal} onToggle={audio.toggle} onRemove={audio.remove} onPlayNext={audio.addNext} playlists={playlists}/>)}</div></div></>}
 {view==='settings'&&<><div className="page-heading"><span className="eyebrow muted">TWÓJ STYL</span><h1>Ustawienia</h1><p>Dostosuj Shutter do siebie.</p></div><div className="content-card settings-card"><h2>Wygląd aplikacji</h2><p>Wybierz motyw. Automatyczny podąża za ustawieniem systemu.</p><div className="theme-options">{[{id:'light',label:'Jasny',Icon:Sun},{id:'dark',label:'Ciemny',Icon:Moon},{id:'auto',label:'Automatyczny',Icon:Monitor}].map(({id,label,Icon})=><button className={theme===id?'theme-selected':''} onClick={()=>setTheme(id)} key={id}><Icon size={26}/><strong>{label}</strong><span>{theme===id?'●':'○'}</span></button>)}</div></div><div className="content-card settings-card glass-look-settings"><h2>Shutter Glass</h2><p>Ustawienia dolnego odtwarzacza i rozwijanej listy. Zmiany widać natychmiast.</p>
 {[
  {key:'opacity',label:'Przezroczystość',min:5,max:90,unit:'%'},
  {key:'blur',label:'Rozmycie tła',min:0,max:30,unit:' px'},
  {key:'glow',label:'Poświata',min:0,max:100,unit:'%'}
 ].map(item=><label className="glass-look-control" key={item.key}><span>{item.label}<strong>{glass.look[item.key]}{item.unit}</strong></span><input type="range" min={item.min} max={item.max} value={glass.look[item.key]} onChange={e=>glass.update(item.key,e.target.value)}/></label>)}
 <button className="glass-look-reset" onClick={glass.reset}>Przywróć domyślny wygląd</button></div>{!caps.nativePlayback&&<div className="content-card settings-card glass-look-settings"><h2>Przejścia między utworami</h2><p>Crossfade nakłada dźwięk dwóch utworów przez podaną liczbę sekund, używając wspólnego equalizera. 0 s oznacza zwykłe przejście.</p><label className="glass-look-control"><span>Crossfade <strong>{audio.transition} s</strong></span><input type="range" min="0" max="12" step="1" value={audio.transition} onChange={e=>audio.setTransition(e.target.value)}/></label><small>Odtwarzanie bezprzerwowe wymagające dokładnego dekodowania plików nie jest jeszcze gwarantowane przez przeglądarkę.</small></div>}<div className="content-card settings-card"><h2>Platformy</h2><p>{caps.nativePlayback?'Android odtwarza muzykę przez Media3.':caps.localImport?'Ta wersja odtwarza własne pliki z urządzenia. Aplikacje natywne i Android Auto wymagają oddzielnych implementacji.':'Wersja webowa odtwarza strumieniowo publiczny katalog SHUTTER. Import własnych plików nie jest dostępny w wersji webowej. Aplikacje natywne i Android Auto wymagają oddzielnych implementacji.'}</p><div className="platform-chips"><span><Headphones size={16}/> Android</span><span><Laptop size={16}/> macOS</span><span><CarFront size={16}/> Android Auto — planowane</span></div></div></>}
 {view==='history'&&<section className="history-view"><div className="page-heading"><span className="eyebrow muted">TWOJE ODSŁUCHY</span><h1>Historia i statystyki</h1><p>Historia pozostaje lokalnie w tej przeglądarce.</p></div><div className="content-card"><div className="history-summary"><strong>{audio.history.length} odtworzeń</strong><button onClick={audio.clearPlays}>Wyczyść historię</button></div>{audio.historyStats.slice(0,8).map(([id,count])=>{const item=audio.files.find(f=>f.id===id);return <div className="history-row" key={id}><span>{item?.title||'Usunięty utwór'}</span><strong>{count} ×</strong></div>})}{!audio.history.length&&<p className="shutter-empty">Historia pojawi się po odtworzeniu muzyki.</p>}</div><div className="content-card"><h2>Ostatnio odtwarzane</h2>{audio.history.slice(0,50).map((h,i)=><div className="history-row" key={h.at+'-'+i}><span>{h.title} · {h.artist}</span><small>{new Date(h.at).toLocaleString('pl-PL')}</small></div>)}</div></section>}
 {view==='eq'&&(caps.nativePlayback?<div className="content-card"><h1>Equalizer</h1><p>Equalizer i analiza dźwięku nie są dostępne w odtwarzaczu Android.</p></div>:<EqualizerPanel eq={audio.eq}/>)}
 {view==='car'&&<><div className="page-heading"><span className="eyebrow muted">PROJEKT EKRANU SAMOCHODOWEGO</span><h1>Car Preview</h1><p>Podgląd wizualny. Faktyczny ekran Android Auto jest kontrolowany przez system i wymaga osobnej integracji Media3.</p></div><div className="car-frame"><div className="car-header"><strong><Music2 size={21}/> shutter.</strong><span><Clock3 size={16}/> 09:41</span></div><div className="car-body"><div className="car-cover-wrap">{cover(song?.art||'night','car-cover')}</div><div className="car-now"><span>TERAZ ODTWARZANE</span><h2>{song?.title||'Brak utworu'}</h2><p>{song?.artist||emptyHint}</p><div className="car-controls"><button aria-label="Poprzedni" onClick={prev}><SkipBack fill="currentColor"/></button><button className="car-play" aria-label={activePlaying?'Pauza':'Odtwórz'} onClick={playToggle}>{activePlaying?<span className="pause-audio-pulse" aria-hidden="true"><span/><span/></span>:<Play fill="currentColor"/>}</button><button aria-label="Następny" onClick={next}><SkipForward fill="currentColor"/></button></div></div><div className="car-queue"><strong>NASTĘPNE</strong>{audio.files.filter(f=>f.id!==song?.id).slice(0,3).map(s=><div key={s.id}><span>{s.title}</span><small>{s.artist}</small></div>)}</div></div></div><div className="car-note">Wersja koncepcyjna — nie jest interfejsem zatwierdzonym ani renderowanym przez Android Auto.</div></>}
 </div>
 </main>
 <PlayerGlass expanded={playerExpanded} look={glass.look}>
  {playerExpanded&&<section className="player-expanded-panel" aria-label="Zawartość playlisty">
   <div className="player-expanded-heading"><div><span className="player-expanded-eyebrow">TERAZ ODTWARZANE</span><h2>{song?.title||'Brak utworu'}</h2><small>{song?.artist||emptyHint} · {song?.album||'Biblioteka'}</small></div><button className="player-expanded-close" aria-label="Zwiń odtwarzacz" onClick={()=>setPlayerExpanded(false)}><X size={21}/></button></div>
   {matchingPlaylists.length>0&&<div className="player-expanded-tabs">{matchingPlaylists.map(list=><button key={list.id} className={activePlaylist?.id===list.id?'active':''} onClick={()=>activatePlaylist(list)}>{list.name}</button>)}</div>}
   <div className="player-queue-toolbar"><div className="player-queue-modes"><button className={audio.shuffle?'selected':''} onClick={audio.toggleShuffle} aria-pressed={audio.shuffle}><Shuffle size={16}/> {audio.shuffle?'Losowo WŁ.':'Losowo WYŁ.'}</button><button className={audio.repeat!=='off'?'selected':''} onClick={audio.cycleRepeat}><Repeat2 size={16}/> {audio.repeat==='one'?'Powtórz 1':audio.repeat==='all'?'Powtarzaj':'Powtarzanie wył.'}</button></div><span>{activePlaylist?.name||'Kolejka'} · {activeQueue.length}</span></div>
   <div className="player-expanded-tracks" role="region" aria-label="Utwory aktywnej kolejki">{activeQueue.map(item=>{const idx=audio.files.findIndex(f=>f.id===item.id),selected=song?.id===item.id;return <button key={item.id} className={selected?'active':''} onClick={()=>selected?audio.toggle():chooseLocal(idx)}><span className="player-queue-art">{selected&&activePlaying?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</span><span className="player-queue-label"><strong>{item.title}</strong><small>{item.artist}</small></span>{selected&&<span className="player-current-marker">TERAZ</span>}</button>})}</div>
   {!activeQueue.length&&<div className="player-expanded-empty">Dodaj utwory do playlisty albo biblioteki.</div>}
  </section>}
  <div className="player-bar player-bar-v5">
   <div className="player-song player-identity"><div className="player-brand-lockup" aria-label="Shutter Music"><Music2 size={17}/><strong>Shutter Music</strong></div><button className="player-song-expand" aria-label={playerExpanded?"Zwiń panel playlisty":"Rozwiń panel playlisty"} aria-expanded={playerExpanded} onClick={()=>{if(song&&!playerExpanded&&matchingPlaylists.length&&(!activePlaylist||!activePlaylist.tracks.includes(song.id)))activatePlaylist(selectedPlayerList);if(song)setPlayerExpanded(v=>!v)}} disabled={!song}><div className="player-song-meta"><strong>{song?.title||'Brak utworu'}</strong><small>{song?.artist||emptyHint} · {song?.album||'Biblioteka'}</small></div><ChevronRight className={playerExpanded?"expanded-chevron":""} size={17}/></button></div>
   <div className="player-middle">
    <div className="progress-line"><span>{formatClock(seekPreview!==null&&totalSeconds>0?totalSeconds*seekPreview/100:currentSeconds)}</span><input type="range" min="0" max="100" step=".1" value={seekPercent} disabled={!song||totalSeconds<=0} onChange={e=>setSeekPreview(Number(e.target.value))} onPointerUp={e=>seekTo(Number(e.currentTarget.value))} onTouchEnd={e=>seekTo(Number(e.currentTarget.value))} onKeyUp={e=>seekTo(Number(e.currentTarget.value))} onBlur={e=>{if(seekPreview!==null)seekTo(Number(e.currentTarget.value))}} aria-label="Pozycja utworu" style={{"--seek-progress":`${seekPercent}%`}}/><span>{formatClock(totalSeconds)}</span></div>
    <div className="player-controls">
     <button type="button" className="flat-transport-control" aria-label="Losowo" aria-pressed={audio.shuffle} onClick={audio.toggleShuffle}><Shuffle size={19}/></button>
     <button type="button" className="flat-transport-control" aria-label="Poprzedni" onClick={prev}><SkipBack fill="currentColor"/></button>
     <button type="button" aria-label={activePlaying?'Pauza':'Odtwórz'} className={`play-button ${activePlaying?"is-playing":""}`} onClick={playToggle}>{activePlaying?<span className="pause-audio-pulse" aria-hidden="true"><span/><span/></span>:<Play fill="currentColor"/>}</button>
     <button type="button" className="flat-transport-control" aria-label="Następny" onClick={next}><SkipForward fill="currentColor"/></button>
     <button type="button" className={`flat-transport-control ${audio.repeat!=='off'?'is-selected':''}`} aria-label={audio.repeat==='one'?'Wyłącz powtarzanie 1':audio.repeat==='all'?'Wyłącz powtarzanie':'Włącz powtarzanie'} aria-pressed={audio.repeat!=='off'} onClick={audio.cycleRepeat}><Repeat2 size={19}/></button>
    </div>
   </div>
   <div className="player-right"><Volume2 size={18}/><input type="range" aria-label="Głośność" value={Math.round(audio.volume*100)} onChange={e=>audio.setGain(Number(e.target.value)/100)}/><span className="quality">SHUTTER</span></div>
  </div></PlayerGlass>
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
registerPWA();
