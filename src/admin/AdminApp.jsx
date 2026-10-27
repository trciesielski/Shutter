import React,{useEffect,useMemo,useRef,useState} from 'react';
import {LayoutDashboard,Upload,ListMusic,HardDrive,History,RefreshCw,Trash2,ArrowUp,ArrowDown,Search,X,AlertTriangle,Image as ImageIcon,Music2,GripVertical,Pencil,Plus,Check} from 'lucide-react';
import {api,describe} from './api.js';
import {uploadFile,fingerprint,cancelUpload} from './upload.js';
import {extractTags,imageInfo,makeThumbnail} from './metadata.js';

const AUDIO_EXT=['mp3','flac','wav','m4a'];
const IMAGE_TYPES=['image/jpeg','image/png','image/webp'];
const AUDIO_LIMIT=1024*1024*1024,COVER_LIMIT=25*1024*1024;
const TEXT_FIELDS=[['title','Tytuł',200],['artist','Wykonawca',200],['album','Album',200],['albumArtist','Wykonawca albumu',200],['genre','Gatunek',80]];
const NUMBER_FIELDS=[['year','Rok',1000,2100,1],['trackNumber','Nr utworu',1,9999,1],['discNumber','Nr płyty',1,999,1],['duration','Czas (s)',0.01,86400,0.01]];
const TABS=[['dashboard','Pulpit',LayoutDashboard],['upload','Dodaj muzykę',Upload],['catalog','Katalog',ListMusic],['storage','Magazyn',HardDrive],['history','Historia',History]];

export const mediaUrl=key=>'/music/'+String(key).split('/').map(encodeURIComponent).join('/');
const extOf=name=>/\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase()||'';
const hex=n=>[...crypto.getRandomValues(new Uint8Array(n))].map(b=>b.toString(16).padStart(2,'0')).join('');
const newId=()=>'t-'+hex(6);
export function fmtBytes(n){if(!Number.isFinite(n))return '—';const u=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return (i?n.toFixed(1):n)+' '+u[i]}
export function fmtDuration(s){if(!Number.isFinite(s))return '—';s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=String(s%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${r}`:`${m}:${r}`}
const fmtDate=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(+d)?'—':d.toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'})};
const fileLabel=key=>String(key).split('/').pop();

function cleanTrack(t){
 const out={};
 for(const [k,v] of Object.entries(t)){
  if(v===undefined||v===null||(typeof v==='string'&&!v.trim())||(typeof v==='number'&&!Number.isFinite(v)))continue;
  out[k]=typeof v==='string'&&k!=='lyrics'?v.trim():v;
 }
 return out;
}
const toDraft=c=>({title:c?.title||'SHUTTER',tracks:(Array.isArray(c?.tracks)?c.tracks:[]).map((t,i)=>({t,i})).sort((a,b)=>(a.t.order??Infinity)-(b.t.order??Infinity)||a.i-b.i).map(x=>({...x.t}))});
const comparable=d=>JSON.stringify({title:d?.title||'',tracks:(d?.tracks||[]).map(({order,...t})=>t)});

export function clientValidate(draft){
 const errors=[],seen=new Set();
 draft.tracks.forEach((t,index)=>{
  const e=(field,code)=>errors.push({index,id:t.id,field,code});
  if(seen.has(t.id))e('id','duplicate_id');seen.add(t.id);
  if(!String(t.title||'').trim())e('title','required');
  if(!t.audio)e('audio','invalid_audio_key');
  if(t.year!==undefined&&!(Number.isInteger(t.year)&&t.year>=1000&&t.year<=2100))e('year','invalid_year');
  if(t.trackNumber!==undefined&&!(Number.isInteger(t.trackNumber)&&t.trackNumber>=1))e('trackNumber','invalid_track_number');
 });
 return errors;
}
const ERROR_TEXT={required:'pole wymagane',duplicate_id:'zduplikowane ID',invalid_audio_key:'nieprawidłowy plik audio',invalid_cover_key:'nieprawidłowa okładka',invalid_year:'nieprawidłowy rok',invalid_track_number:'nieprawidłowy numer',object_missing:'brak pliku w magazynie',invalid_text:'nieprawidłowy tekst',too_long:'za długi tekst',invalid_duration:'nieprawidłowy czas'};
const errorText=e=>`${e.id?`[${e.id}] `:''}${e.field?e.field+': ':''}${ERROR_TEXT[e.code]||e.code}`;

function useStatus(){
 const [status,setStatus]=useState(null);
 const timer=useRef(null);
 const show=(type,text)=>{clearTimeout(timer.current);setStatus({type,text});if(type==='ok')timer.current=setTimeout(()=>setStatus(null),6000)};
 return [status,show,()=>setStatus(null)];
}

function Dialog({dialog,onClose}){
 const [typed,setTyped]=useState('');
 const ref=useRef(null);
 useEffect(()=>{setTyped('');ref.current?.focus()},[dialog]);
 useEffect(()=>{if(!dialog)return;const k=e=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[dialog]);
 if(!dialog)return null;
 const ok=!dialog.typeToConfirm||typed===dialog.typeToConfirm;
 return <div className="adm-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="adm-dialog" role="dialog" aria-modal="true" aria-labelledby="adm-dialog-title">
   <h2 id="adm-dialog-title">{dialog.title}</h2>
   <div className="adm-dialog-body">{dialog.body}</div>
   {dialog.typeToConfirm&&<label className="adm-field">Wpisz <strong>{dialog.typeToConfirm}</strong>, aby potwierdzić<input ref={ref} value={typed} onChange={e=>setTyped(e.target.value)} autoComplete="off"/></label>}
   <div className="adm-dialog-actions">
    <button type="button" className="adm-btn" onClick={onClose} ref={dialog.typeToConfirm?undefined:ref}>Anuluj</button>
    <button type="button" className={`adm-btn ${dialog.danger?'adm-btn-danger':'adm-btn-primary'}`} disabled={!ok} onClick={()=>{onClose();dialog.onConfirm()}}>{dialog.confirmLabel||'Potwierdź'}</button>
   </div>
  </div>
 </div>;
}

function Cover({track,size='md'}){
 const [failed,setFailed]=useState(false);
 const key=track?.thumbnail||track?.cover;
 useEffect(()=>setFailed(false),[key]);
 if(!key||failed)return <div className={`adm-cover adm-cover-${size} adm-cover-empty`} aria-hidden="true"><Music2 size={size==='lg'?36:16}/></div>;
 return <img className={`adm-cover adm-cover-${size}`} src={mediaUrl(key)} alt="" loading="lazy" onError={()=>setFailed(true)}/>;
}

// value: null | {key} (existing artwork) | {file, preview, info} (new upload, not yet sent)
function CoverPicker({value,onChange,existing,disabled,label='Okładka'}){
 const input=useRef(null);
 const [drag,setDrag]=useState(false),[err,setErr]=useState('');
 async function pick(file){
  setErr('');
  if(!file)return;
  if(!IMAGE_TYPES.includes(file.type)){setErr('Okładka musi być w formacie JPG, PNG lub WebP.');return}
  if(file.size>COVER_LIMIT){setErr('Okładka jest zbyt duża (maks. 25 MB).');return}
  try{const info=await imageInfo(file);onChange({file,preview:URL.createObjectURL(file),info})}catch{setErr('Nie można odczytać obrazu.')}
 }
 const preview=value?.preview||(value?.key?mediaUrl(value.key):null);
 return <div className="adm-coverpick">
  <span className="adm-label">{label}</span>
  <div className={`adm-coverdrop${drag?' drag':''}`} onDragOver={e=>{e.preventDefault();if(!disabled)setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(!disabled)pick(e.dataTransfer.files?.[0])}}>
   {preview?<img src={preview} alt="Podgląd okładki" className="adm-cover adm-cover-lg adm-cover-contain"/>:<div className="adm-cover adm-cover-lg adm-cover-empty"><ImageIcon size={30}/></div>}
   <div className="adm-coverpick-actions">
    <button type="button" className="adm-btn adm-btn-sm" disabled={disabled} onClick={()=>input.current?.click()}>{value?'Zmień okładkę':'Wybierz okładkę'}</button>
    {existing?.length>0&&<select aria-label="Użyj istniejącej okładki" disabled={disabled} value={value?.key||''} onChange={e=>onChange(e.target.value?{key:e.target.value}:null)}>
     <option value="">Istniejąca okładka…</option>
     {existing.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
    </select>}
    {value&&<button type="button" className="adm-btn adm-btn-sm adm-btn-ghost" disabled={disabled} onClick={()=>onChange(null)}>Bez okładki</button>}
    {value?.info&&<small>{value.info.width}×{value.info.height} px{value.source==='embedded'?' · z pliku audio':''}</small>}
    {value?.info?.warning&&<small className="adm-warn"><AlertTriangle size={12}/> {value.info.warning}</small>}
    {err&&<small className="adm-error-text" role="alert">{err}</small>}
   </div>
   <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e=>{pick(e.target.files?.[0]);e.target.value=''}}/>
  </div>
 </div>;
}

async function sendCover(value,onProgress=()=>{}){
 if(!value)return {};
 if(value.key)return {cover:value.key};
 const state=value.state||(value.state={}),thumbState=value.thumbState||(value.thumbState={});
 const main=state.result||await uploadFile(value.file,{kind:'cover',state,onProgress});
 let thumbnail;
 try{
  if(!value.thumb)value.thumb=await makeThumbnail(value.file);
  if(value.thumb)thumbnail=(thumbState.result||await uploadFile(value.thumb,{kind:'cover',state:thumbState})).key;
 }catch{}
 return {cover:main.key,...(thumbnail?{thumbnail}:{})};
}

function TrackFields({fields,onChange,disabled,verified={},idPrefix}){
 return <div className="adm-fields">
  {TEXT_FIELDS.map(([k,label,max])=><label key={k} className="adm-field">{label}{verified[k]&&<span className="adm-tag" title="Wartość odczytana z tagów pliku">tag</span>}
   <input id={`${idPrefix}-${k}`} value={fields[k]??''} maxLength={max} disabled={disabled} required={k==='title'} onChange={e=>onChange({[k]:e.target.value})}/></label>)}
  {NUMBER_FIELDS.map(([k,label,min,max,step])=><label key={k} className="adm-field adm-field-sm">{label}{verified[k]&&<span className="adm-tag">tag</span>}
   <input type="number" inputMode="decimal" min={min} max={max} step={step} value={fields[k]??''} disabled={disabled} onChange={e=>onChange({[k]:e.target.value===''?undefined:Number(e.target.value)})}/></label>)}
  <label className="adm-field adm-field-wide">Tekst utworu (opcjonalnie){verified.lyrics&&<span className="adm-tag">tag</span>}
   <textarea rows={4} value={fields.lyrics??''} maxLength={20000} disabled={disabled} onChange={e=>onChange({lyrics:e.target.value})}/></label>
 </div>;
}

function Dashboard({remote,draft,storage,dirty,onTab}){
 const tracks=draft?.tracks||[];
 const artists=new Set(tracks.map(t=>(t.artist||'').trim().toLowerCase()).filter(Boolean));
 const albums=new Set(tracks.filter(t=>t.album).map(t=>(t.albumArtist||t.artist||'')+'\u0001'+t.album));
 const byKey=new Map(tracks.map(t=>[t.audio,t]));
 const recent=(storage?.objects||[]).filter(o=>o.key.startsWith('tracks/')).slice(0,6);
 const unused=(storage?.objects||[]).filter(o=>!o.referencedBy.length).length;
 const problems=[];
 if(!remote.exists)problems.push('Opublikowany katalog jeszcze nie istnieje — publiczny odtwarzacz pokazuje błąd katalogu.');
 if(remote.validation?.length)problems.push(`Opublikowany katalog ma błędy walidacji: ${remote.validation.length}.`);
 if(storage?.missing?.length)problems.push(`Brakujące pliki w magazynie: ${storage.missing.length}.`);
 return <section aria-labelledby="dash-h">
  <h1 id="dash-h" className="adm-h1">Pulpit</h1>
  <div className="adm-stats">
   <div className="adm-stat"><span>Utwory</span><strong>{tracks.length}</strong></div>
   <div className="adm-stat"><span>Albumy</span><strong>{albums.size}</strong></div>
   <div className="adm-stat"><span>Wykonawcy</span><strong>{artists.size}</strong></div>
   <div className="adm-stat"><span>Magazyn</span><strong>{storage?fmtBytes(storage.totals.tracks.bytes+storage.totals.covers.bytes):'…'}</strong><small>{storage?`${storage.totals.tracks.count} audio · ${storage.totals.covers.count} grafik`:''}</small></div>
  </div>
  <div className="adm-grid2">
   <div className="adm-card">
    <h2>Stan katalogu</h2>
    {problems.length===0&&!dirty?<p className="adm-ok"><Check size={16}/> Katalog jest poprawny i opublikowany.</p>:null}
    {dirty&&<p className="adm-warn"><AlertTriangle size={14}/> Masz nieopublikowane zmiany.</p>}
    {problems.map(p=><p key={p} className="adm-warn"><AlertTriangle size={14}/> {p}</p>)}
    {unused>0&&<p className="adm-muted">Nieużywane pliki w magazynie: {unused}. <button type="button" className="adm-link" onClick={()=>onTab('storage')}>Przejdź do magazynu</button></p>}
    <p className="adm-muted">Ostatnia publikacja: {fmtDate(remote.updated)}</p>
   </div>
   <div className="adm-card">
    <h2>Ostatnio wysłane</h2>
    {!recent.length&&<p className="adm-muted">Brak plików audio w magazynie.</p>}
    <ul className="adm-list">{recent.map(o=>{const t=byKey.get(o.key);return <li key={o.key}><Cover track={t}/><div><strong>{t?.title||fileLabel(o.key)}</strong><small>{t?t.artist||'—':'nie w katalogu'} · {fmtBytes(o.size)} · {fmtDate(o.uploaded)}</small></div></li>})}</ul>
   </div>
  </div>
 </section>;
}

function UploadView({queue,setQueue,draft,addTracks,coverChoices,showStatus}){
 const input=useRef(null);
 const [drag,setDrag]=useState(false);
 const update=(uid,patch)=>setQueue(q=>q.map(it=>it.uid===uid?{...it,...(typeof patch==='function'?patch(it):patch)}:it));
 async function addFiles(list){
  const files=[...list];
  for(const file of files){
   const uid=hex(8),ext=extOf(file.name);
   if(!AUDIO_EXT.includes(ext)){setQueue(q=>[...q,{uid,file,status:'rejected',error:'Nieobsługiwany format. Dozwolone: MP3, FLAC, WAV, M4A.'}]);continue}
   if(file.size>AUDIO_LIMIT){setQueue(q=>[...q,{uid,file,status:'rejected',error:'Plik jest zbyt duży (maks. 1 GB).'}]);continue}
   setQueue(q=>[...q,{uid,file,status:'analysing',progress:0,fields:{},verified:{},cover:null,uploadState:{}}]);
   const [{tags,guessed,picture},fp]=await Promise.all([extractTags(file),fingerprint(file).catch(()=>null)]);
   let cover=null;
   if(picture){try{cover={file:picture,preview:URL.createObjectURL(picture),info:await imageInfo(picture),source:'embedded'}}catch{}}
   const verified=Object.fromEntries(Object.keys(tags).map(k=>[k,true]));
   const dup=fp&&draft?.tracks.find(t=>t.fingerprint===fp);
   update(uid,{status:dup?'duplicate':'ready',fields:{...guessed,...tags},verified,cover,fp,duplicateOf:dup?dup.title:null});
  }
 }
 async function send(it,allowDuplicate=false){
  if(!String(it.fields.title||'').trim()){update(it.uid,{error:'Podaj tytuł utworu.'});return}
  update(it.uid,{status:'uploading',error:null,progress:0});
  try{
   const audio=it.uploadState.result||await uploadFile(it.file,{kind:'audio',fingerprint:it.fp,allowDuplicate,state:it.uploadState,onProgress:p=>update(it.uid,{progress:p*0.9})});
   const art=await sendCover(it.cover,p=>update(it.uid,{progress:0.9+p*0.1}));
   const track=cleanTrack({id:newId(),...it.fields,audio:audio.key,mimeType:audio.contentType,...art,fingerprint:audio.fingerprint||it.fp||undefined,size:audio.size,addedAt:new Date().toISOString()});
   addTracks([track]);
   update(it.uid,{status:'added',progress:1,trackId:track.id});
  }catch(error){
   if(error?.code==='duplicate'){update(it.uid,{status:'duplicate',duplicateOf:error.body?.title||error.body?.trackId,uploadState:{}});return}
   update(it.uid,{status:'error',error:describe(error)});
  }
 }
 async function remove(it){await cancelUpload(it.uploadState);if(it.cover?.preview)URL.revokeObjectURL(it.cover.preview);setQueue(q=>q.filter(x=>x.uid!==it.uid))}
 const ready=queue.filter(it=>it.status==='ready');
 async function sendAll(){for(const it of ready)await send(it);showStatus('info','Wysłane utwory dodano do wersji roboczej. Opublikuj katalog, aby były widoczne publicznie.')}
 return <section aria-labelledby="up-h">
  <h1 id="up-h" className="adm-h1">Dodaj muzykę</h1>
  <div className={`adm-drop${drag?' drag':''}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);addFiles(e.dataTransfer.files)}}>
   <Upload size={28}/>
   <p><strong>Przeciągnij pliki audio tutaj</strong><br/><span className="adm-muted">MP3, FLAC, WAV, M4A · maks. 1 GB na plik</span></p>
   <button type="button" className="adm-btn adm-btn-primary" onClick={()=>input.current?.click()}>Wybierz pliki</button>
   <input ref={input} type="file" multiple hidden accept=".mp3,.flac,.wav,.m4a,audio/mpeg,audio/flac,audio/wav,audio/mp4" onChange={e=>{addFiles(e.target.files);e.target.value=''}} data-testid="audio-input"/>
  </div>
  {ready.length>1&&<div className="adm-row-end"><button type="button" className="adm-btn adm-btn-primary" onClick={sendAll}>Wyślij wszystkie ({ready.length})</button></div>}
  <ul className="adm-queue" aria-live="polite">
   {queue.map(it=>{
    const locked=it.status==='uploading'||it.status==='added'||it.status==='analysing';
    return <li key={it.uid} className={`adm-card adm-qitem adm-q-${it.status}`} data-testid="upload-item">
     <div className="adm-qhead">
      <div><strong>{it.file.name}</strong><small>{fmtBytes(it.file.size)} · {({analysing:'Analiza metadanych…',ready:'Gotowy do wysłania',uploading:'Wysyłanie…',added:'Dodano do wersji roboczej',error:'Błąd',duplicate:'Duplikat',rejected:'Odrzucony'})[it.status]}</small></div>
      <button type="button" className="adm-icon" aria-label={`Usuń ${it.file.name} z kolejki`} disabled={it.status==='uploading'} onClick={()=>remove(it)}><X size={16}/></button>
     </div>
     {(it.status==='uploading'||it.status==='added'||(it.status==='error'&&it.progress>0))&&<div className="adm-progress" role="progressbar" aria-label={`Postęp wysyłania ${it.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((it.progress||0)*100)}><span style={{width:`${Math.round((it.progress||0)*100)}%`}}/></div>}
     {it.error&&<p className="adm-error-text" role="alert">{it.error}</p>}
     {it.status==='duplicate'&&<p className="adm-warn"><AlertTriangle size={14}/> Ten plik jest już w katalogu{it.duplicateOf?` („${it.duplicateOf}”)`:''}. <button type="button" className="adm-link" onClick={()=>send(it,true)}>Wyślij mimo to</button></p>}
     {it.status!=='rejected'&&it.fields&&<div className="adm-qbody">
      <CoverPicker value={it.cover} existing={coverChoices} disabled={locked} onChange={cover=>update(it.uid,{cover})}/>
      <TrackFields idPrefix={it.uid} fields={it.fields} verified={it.verified} disabled={locked} onChange={p=>update(it.uid,x=>({fields:{...x.fields,...p}}))}/>
     </div>}
     {(it.status==='ready'||it.status==='error')&&<div className="adm-row-end"><button type="button" className="adm-btn adm-btn-primary" onClick={()=>send(it)}>{it.status==='error'?'Ponów wysyłanie':'Wyślij i dodaj do katalogu'}</button></div>}
    </li>})}
  </ul>
 </section>;
}

function TrackEditor({track,onSave,onClose,coverChoices,showStatus}){
 const [fields,setFields]=useState(()=>({...track}));
 const [cover,setCover]=useState(()=>track.cover?{key:track.cover}:null);
 const [saving,setSaving]=useState(false);
 async function save(){
  if(!String(fields.title||'').trim()){showStatus('error','Tytuł jest wymagany.');return}
  setSaving(true);
  try{
   let art={cover:undefined,thumbnail:undefined};
   if(cover?.key)art=cover.key===track.cover?{cover:track.cover,thumbnail:track.thumbnail}:{cover:cover.key,thumbnail:coverChoices.find(c=>c.key===cover.key)?.thumbnail};
   else if(cover?.file)art={thumbnail:undefined,...await sendCover(cover)};
   onSave(cleanTrack({...fields,...art,id:track.id}));
  }catch(error){showStatus('error',describe(error))}finally{setSaving(false)}
 }
 return <div className="adm-overlay adm-overlay-side" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <aside className="adm-editor" role="dialog" aria-modal="true" aria-labelledby="ed-h">
   <div className="adm-qhead"><h2 id="ed-h">Edytuj utwór</h2><button type="button" className="adm-icon" aria-label="Zamknij edytor" onClick={onClose}><X size={18}/></button></div>
   <p className="adm-muted adm-mono">ID: {track.id} · {fileLabel(track.audio)}</p>
   <audio controls preload="none" src={mediaUrl(track.audio)} className="adm-audio"/>
   <CoverPicker value={cover} existing={coverChoices} disabled={saving} onChange={setCover}/>
   <TrackFields idPrefix="ed" fields={fields} disabled={saving} onChange={p=>setFields(f=>({...f,...p}))}/>
   <div className="adm-dialog-actions"><button type="button" className="adm-btn" onClick={onClose}>Anuluj</button><button type="button" className="adm-btn adm-btn-primary" disabled={saving} onClick={save}>{saving?'Zapisywanie…':'Zastosuj w wersji roboczej'}</button></div>
  </aside>
 </div>;
}

function CatalogView({draft,setDraft,errors,coverChoices,confirm,showStatus}){
 const [query,setQuery]=useState(''),[artist,setArtist]=useState(''),[album,setAlbum]=useState(''),[genre,setGenre]=useState('');
 const [selected,setSelected]=useState(()=>new Set()),[editing,setEditing]=useState(null),[bulk,setBulk]=useState({});
 const dragId=useRef(null);
 const tracks=draft.tracks;
 const options=key=>[...new Set(tracks.map(t=>t[key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pl'));
 const q=query.trim().toLocaleLowerCase('pl');
 const filtered=tracks.filter(t=>(!q||[t.title,t.artist,t.album,t.genre,t.id].some(v=>String(v||'').toLocaleLowerCase('pl').includes(q)))&&(!artist||t.artist===artist)&&(!album||t.album===album)&&(!genre||t.genre===genre));
 const filteredActive=filtered.length!==tracks.length;
 const errorIds=new Set(errors.map(e=>e.id).filter(Boolean));
 const setTracks=fn=>setDraft(d=>({...d,tracks:fn(d.tracks)}));
 const move=(id,delta)=>setTracks(list=>{const i=list.findIndex(t=>t.id===id),j=i+delta;if(i<0||j<0||j>=list.length)return list;const out=[...list];[out[i],out[j]]=[out[j],out[i]];return out});
 const moveTo=(id,targetId)=>setTracks(list=>{const from=list.findIndex(t=>t.id===id),to=list.findIndex(t=>t.id===targetId);if(from<0||to<0||from===to)return list;const out=[...list];const [x]=out.splice(from,1);out.splice(to,0,x);return out});
 const toggle=id=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n});
 const removeIds=ids=>confirm({title:ids.length>1?`Usunąć ${ids.length} utwory z katalogu?`:'Usunąć utwór z katalogu?',body:<p>Utwory znikną z publicznego katalogu po publikacji. Pliki pozostaną w magazynie R2 — trwałe usunięcie jest osobną operacją w zakładce Magazyn.</p>,confirmLabel:'Usuń z katalogu',danger:true,onConfirm:()=>{setTracks(list=>list.filter(t=>!ids.includes(t.id)));setSelected(new Set())}});
 function applyBulk(){
  const patch=Object.fromEntries(Object.entries(bulk).filter(([,v])=>v!==''&&v!==undefined));
  if(patch.year!==undefined){patch.year=Number(patch.year);if(!Number.isInteger(patch.year)||patch.year<1000||patch.year>2100){showStatus('error','Nieprawidłowy rok.');return}}
  if(!Object.keys(patch).length){showStatus('error','Wypełnij co najmniej jedno pole zbiorczej edycji.');return}
  setTracks(list=>list.map(t=>selected.has(t.id)?cleanTrack({...t,...patch}):t));setBulk({});
  showStatus('ok',`Zmieniono ${selected.size} utworów w wersji roboczej.`);
 }
 const visibleIds=filtered.map(t=>t.id),allSelected=visibleIds.length>0&&visibleIds.every(id=>selected.has(id));
 return <section aria-labelledby="cat-h">
  <h1 id="cat-h" className="adm-h1">Katalog <small className="adm-muted">{tracks.length} utworów</small></h1>
  <div className="adm-filters">
   <label className="adm-search"><Search size={16}/><input type="search" placeholder="Szukaj tytułu, wykonawcy, albumu…" aria-label="Szukaj w katalogu" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <select aria-label="Filtr wykonawcy" value={artist} onChange={e=>setArtist(e.target.value)}><option value="">Wszyscy wykonawcy</option>{options('artist').map(v=><option key={v}>{v}</option>)}</select>
   <select aria-label="Filtr albumu" value={album} onChange={e=>setAlbum(e.target.value)}><option value="">Wszystkie albumy</option>{options('album').map(v=><option key={v}>{v}</option>)}</select>
   <select aria-label="Filtr gatunku" value={genre} onChange={e=>setGenre(e.target.value)}><option value="">Wszystkie gatunki</option>{options('genre').map(v=><option key={v}>{v}</option>)}</select>
  </div>
  {selected.size>0&&<div className="adm-card adm-bulk" aria-label="Edycja zbiorcza">
   <strong>Zaznaczone: {selected.size}</strong>
   {[['artist','Wykonawca'],['album','Album'],['albumArtist','Wykonawca albumu'],['genre','Gatunek'],['year','Rok']].map(([k,l])=><input key={k} aria-label={`Zbiorczo: ${l}`} placeholder={l} type={k==='year'?'number':'text'} value={bulk[k]??''} onChange={e=>setBulk(b=>({...b,[k]:e.target.value}))}/>)}
   <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={applyBulk}>Zastosuj do zaznaczonych</button>
   <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={()=>removeIds([...selected])}>Usuń z katalogu</button>
   <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={()=>setSelected(new Set())}>Odznacz</button>
  </div>}
  {filteredActive&&<p className="adm-muted">Zmiana kolejności jest dostępna bez aktywnych filtrów.</p>}
  {!tracks.length&&<p className="adm-card adm-muted">Katalog jest pusty. Dodaj muzykę w zakładce „Dodaj muzykę”.</p>}
  {tracks.length>0&&<div className="adm-table" role="table" aria-label="Utwory w katalogu">
   <div className="adm-tr adm-th" role="row"><span role="columnheader"><input type="checkbox" aria-label="Zaznacz wszystkie widoczne" checked={allSelected} onChange={()=>setSelected(s=>{const n=new Set(s);allSelected?visibleIds.forEach(id=>n.delete(id)):visibleIds.forEach(id=>n.add(id));return n})}/></span><span role="columnheader">Utwór</span><span role="columnheader" className="adm-hide-sm">Album</span><span role="columnheader" className="adm-hide-sm">Czas</span><span role="columnheader">Akcje</span></div>
   {filtered.map(t=>{const pos=tracks.indexOf(t);return <div key={t.id} role="row" data-testid="catalog-row" className={`adm-tr${errorIds.has(t.id)?' adm-tr-error':''}${selected.has(t.id)?' adm-tr-selected':''}`} draggable={!filteredActive} onDragStart={()=>{dragId.current=t.id}} onDragOver={e=>{if(!filteredActive)e.preventDefault()}} onDrop={e=>{e.preventDefault();if(dragId.current)moveTo(dragId.current,t.id);dragId.current=null}}>
    <span role="cell"><input type="checkbox" aria-label={`Zaznacz ${t.title}`} checked={selected.has(t.id)} onChange={()=>toggle(t.id)}/></span>
    <span role="cell" className="adm-track">{!filteredActive&&<GripVertical size={14} className="adm-grip" aria-hidden="true"/>}<Cover track={t}/><span><strong>{t.title||<em className="adm-error-text">bez tytułu</em>}</strong><small>{t.artist||'—'}{t.genre?` · ${t.genre}`:''}{t.year?` · ${t.year}`:''}</small></span></span>
    <span role="cell" className="adm-hide-sm adm-muted">{t.album||'—'}</span>
    <span role="cell" className="adm-hide-sm adm-muted">{fmtDuration(t.duration)}</span>
    <span role="cell" className="adm-actions">
     <button type="button" className="adm-icon" aria-label={`Przesuń wyżej: ${t.title}`} disabled={filteredActive||pos===0} onClick={()=>move(t.id,-1)}><ArrowUp size={15}/></button>
     <button type="button" className="adm-icon" aria-label={`Przesuń niżej: ${t.title}`} disabled={filteredActive||pos===tracks.length-1} onClick={()=>move(t.id,1)}><ArrowDown size={15}/></button>
     <button type="button" className="adm-icon" aria-label={`Edytuj: ${t.title}`} onClick={()=>setEditing(t.id)}><Pencil size={15}/></button>
     <button type="button" className="adm-icon adm-icon-danger" aria-label={`Usuń z katalogu: ${t.title}`} onClick={()=>removeIds([t.id])}><Trash2 size={15}/></button>
    </span>
   </div>})}
  </div>}
  {editing&&tracks.find(t=>t.id===editing)&&<TrackEditor track={tracks.find(t=>t.id===editing)} coverChoices={coverChoices} showStatus={showStatus} onClose={()=>setEditing(null)} onSave={next=>{setTracks(list=>list.map(t=>t.id===next.id?next:t));setEditing(null);showStatus('ok','Zmiany zapisano w wersji roboczej.')}}/>}
 </section>;
}

function StorageView({storage,draft,remote,reload,confirm,showStatus,addTracks}){
 const [filter,setFilter]=useState('all');
 if(!storage)return <p className="adm-muted">Wczytywanie magazynu…</p>;
 const draftRefs=new Map();
 for(const t of draft?.tracks||[])for(const k of [t.audio,t.cover,t.thumbnail])if(k){if(!draftRefs.has(k))draftRefs.set(k,[]);draftRefs.get(k).push(t.title||t.id)}
 const list=storage.objects.filter(o=>filter==='all'||(filter==='unused'?!o.referencedBy.length&&!draftRefs.has(o.key):o.key.startsWith(filter)));
 const titleOf=id=>remote.catalog?.tracks?.find(t=>t.id===id)?.title||id;
 function del(o){
  confirm({title:'Trwale usunąć plik z R2?',danger:true,typeToConfirm:'USUŃ',confirmLabel:'Usuń trwale',body:<><p>Plik <code>{o.key}</code> ({fmtBytes(o.size)}) zostanie nieodwracalnie usunięty z bucketu <code>music</code>.</p><p>Tej operacji nie można cofnąć.</p></>,onConfirm:async()=>{
   try{await api('objects',{method:'DELETE',body:{key:o.key,confirm:o.key}});showStatus('ok',`Usunięto ${fileLabel(o.key)}.`)}
   catch(error){showStatus('error',error.code==='object_referenced'?`${describe(error)} (${(error.body.tracks||[]).map(titleOf).join(', ')})`:describe(error))}
   reload();
  }});
 }
 return <section aria-labelledby="st-h">
  <h1 id="st-h" className="adm-h1">Magazyn R2</h1>
  <div className="adm-stats">
   <div className="adm-stat"><span>Audio</span><strong>{fmtBytes(storage.totals.tracks.bytes)}</strong><small>{storage.totals.tracks.count} plików</small></div>
   <div className="adm-stat"><span>Okładki</span><strong>{fmtBytes(storage.totals.covers.bytes)}</strong><small>{storage.totals.covers.count} plików</small></div>
  </div>
  {storage.missing.length>0&&<div className="adm-card"><h2 className="adm-warn"><AlertTriangle size={16}/> Brakujące pliki</h2><ul className="adm-plain">{storage.missing.map(m=><li key={m.key}><code>{m.key}</code> — {m.referencedBy.map(titleOf).join(', ')}</li>)}</ul></div>}
  <div className="adm-filters">
   <select aria-label="Filtr plików" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Wszystkie pliki</option><option value="unused">Tylko nieużywane</option><option value="tracks/">Audio</option><option value="covers/">Okładki</option></select>
   <button type="button" className="adm-btn adm-btn-sm" onClick={reload}><RefreshCw size={14}/> Odśwież</button>
  </div>
  <div className="adm-table" role="table" aria-label="Pliki w magazynie">
   {list.map(o=>{const used=[...o.referencedBy.map(titleOf),...(draftRefs.get(o.key)||[])];const usedSet=[...new Set(used)];const isAudio=o.key.startsWith('tracks/');return <div key={o.key} role="row" className="adm-tr adm-tr-storage" data-testid="storage-row">
    <span role="cell" className="adm-mono adm-break">{o.key}</span>
    <span role="cell" className="adm-muted">{fmtBytes(o.size)}</span>
    <span role="cell" className="adm-muted adm-hide-sm">{fmtDate(o.uploaded)}</span>
    <span role="cell" className="adm-muted">{usedSet.length?`Używany: ${usedSet.join(', ')}`:'Nieużywany'}</span>
    <span role="cell" className="adm-actions">
     {isAudio&&!usedSet.length&&<button type="button" className="adm-btn adm-btn-sm" onClick={()=>{addTracks([cleanTrack({id:newId(),title:fileLabel(o.key).replace(/\.[^.]+$/,''),audio:o.key,size:o.size,addedAt:new Date().toISOString()})]);showStatus('ok','Dodano pozycję do wersji roboczej — uzupełnij metadane w zakładce Katalog.')}}><Plus size={14}/> Do katalogu</button>}
     <button type="button" className="adm-icon adm-icon-danger" aria-label={`Usuń trwale ${o.key}`} title={usedSet.length?'Plik jest używany — najpierw usuń go z katalogu i opublikuj':'Usuń trwale'} disabled={usedSet.length>0} onClick={()=>del(o)}><Trash2 size={15}/></button>
    </span>
   </div>})}
   {!list.length&&<p className="adm-muted">Brak plików.</p>}
  </div>
 </section>;
}

function HistoryView({history,dirty,rollback,reload}){
 if(!history)return <p className="adm-muted">Wczytywanie historii…</p>;
 return <section aria-labelledby="hi-h">
  <h1 id="hi-h" className="adm-h1">Historia wersji</h1>
  <p className="adm-muted">Przed każdą publikacją poprzednia wersja katalogu jest zapisywana w <code>admin/catalog-history/</code> (przechowywane jest ostatnie 100 wersji). Przywrócenie samo jest publikacją — bieżąca wersja również trafia do historii.</p>
  <div className="adm-filters"><button type="button" className="adm-btn adm-btn-sm" onClick={reload}><RefreshCw size={14}/> Odśwież</button></div>
  {!history.length&&<p className="adm-card adm-muted">Brak zapisanych wersji.</p>}
  <ul className="adm-list adm-history">{history.map(v=><li key={v.key} data-testid="history-row"><div><strong>{fmtDate(v.uploaded)}</strong><small>{v.reason||'publikacja'}{v.replacedBy?` · ${v.replacedBy}`:''} · {fmtBytes(v.size)}</small></div><button type="button" className="adm-btn adm-btn-sm" disabled={dirty} title={dirty?'Najpierw opublikuj lub odrzuć bieżące zmiany':undefined} onClick={()=>rollback(v)}>Przywróć</button></li>)}</ul>
 </section>;
}

export default function AdminApp(){
 const [session,setSession]=useState(null),[fatal,setFatal]=useState(null);
 const [remote,setRemote]=useState({exists:false,etag:null,catalog:null,validation:[]});
 const [draft,setDraft]=useState(null),[storage,setStorage]=useState(null),[history,setHistory]=useState(null);
 const [tab,setTab]=useState('dashboard'),[queue,setQueue]=useState([]),[errors,setErrors]=useState([]);
 const [busy,setBusy]=useState(false),[conflict,setConflict]=useState(false),[dialog,setDialog]=useState(null);
 const [status,showStatus,clearStatus]=useStatus();
 const dirty=draft!==null&&comparable(draft)!==comparable(toDraft(remote.catalog));
 const uploading=queue.some(it=>it.status==='uploading');

 async function loadCatalog(){const r=await api('catalog');setRemote(r);setDraft(toDraft(r.catalog));setConflict(false);setErrors([])}
 const loadStorage=()=>api('storage').then(setStorage).catch(e=>showStatus('error',describe(e)));
 const loadHistory=()=>api('catalog/history').then(r=>setHistory(r.versions)).catch(e=>showStatus('error',describe(e)));
 useEffect(()=>{
  (async()=>{
   try{setSession(await api('session'))}catch(e){setFatal(describe(e));return}
   try{await loadCatalog()}catch(e){setFatal(describe(e));return}
   loadStorage();loadHistory();
  })();
 },[]);
 useEffect(()=>{
  const warn=e=>{if(dirty||uploading){e.preventDefault();e.returnValue=''}};
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[dirty,uploading]);

 const addTracks=tracks=>setDraft(d=>({...d,tracks:[...d.tracks,...tracks]}));
 const coverChoices=useMemo(()=>{
  const seen=new Map();
  for(const t of draft?.tracks||[])if(t.cover&&!seen.has(t.cover))seen.set(t.cover,{key:t.cover,thumbnail:t.thumbnail,label:`${t.album||t.title} — ${fileLabel(t.cover)}`});
  return [...seen.values()];
 },[draft]);

 async function publish(){
  const local=clientValidate(draft);
  if(local.length){setErrors(local);showStatus('error','Popraw błędy przed publikacją.');return}
  setBusy(true);
  const tracks=draft.tracks.map((t,i)=>({...t,order:i+1}));
  const finish=r=>{
   setRemote({exists:true,etag:r.etag,catalog:r.catalog,validation:[],updated:r.catalog.updatedAt});
   setDraft(toDraft(r.catalog));setErrors([]);
   showStatus('ok','Katalog opublikowany. Publiczny odtwarzacz wczyta nową wersję przy następnym odświeżeniu katalogu.');
   loadStorage();loadHistory();
  };
  try{
   finish(await api('catalog',{method:'PUT',body:{catalog:{version:1,title:draft.title,tracks},etag:remote.etag}}));
  }catch(e){
   let error=e;
   if(error.code==='catalog_conflict'){
    // A permanent media delete serializes publishers by rewriting the catalog bytes (same content,
    // new ETag). If the remote is still content-identical to our base, adopt its ETag and retry once
    // instead of discarding the draft.
    const fresh=await api('catalog').catch(()=>null);
    const canon=o=>JSON.stringify(o&&{version:o.version,title:o.title,tracks:o.tracks});
    if(fresh&&fresh.etag&&canon(fresh.catalog)===canon(remote.catalog)){
     try{finish(await api('catalog',{method:'PUT',body:{catalog:{version:1,title:draft.title,tracks},etag:fresh.etag}}));error=null}
     catch(retry){error=retry}
    }
   }
   if(error){
    if(error.code==='catalog_conflict')setConflict(true);
    if(error.code==='catalog_invalid')setErrors(error.body.errors||[]);
    showStatus('error',describe(error));
   }
  }finally{setBusy(false)}
 }
 const discard=()=>setDialog({title:'Odrzucić nieopublikowane zmiany?',body:<p>Wersja robocza wróci do ostatnio opublikowanego katalogu. Wysłane pliki pozostaną w magazynie.</p>,danger:true,confirmLabel:'Odrzuć zmiany',onConfirm:()=>{setDraft(toDraft(remote.catalog));setErrors([])}});
 const reloadLatest=()=>setDialog({title:'Wczytać najnowszą wersję katalogu?',body:<p>Twoje nieopublikowane zmiany zostaną porzucone.</p>,danger:true,confirmLabel:'Wczytaj najnowszą',onConfirm:()=>loadCatalog().then(()=>showStatus('ok','Wczytano najnowszą wersję katalogu.')).catch(e=>showStatus('error',describe(e)))});
 const rollback=v=>setDialog({title:'Przywrócić tę wersję katalogu?',body:<p>Wersja z {fmtDate(v.uploaded)} zostanie opublikowana. Obecny katalog zostanie zapisany w historii.</p>,confirmLabel:'Przywróć',onConfirm:async()=>{
  try{await api('catalog/rollback',{method:'POST',body:{version:v.key,etag:remote.etag}});await loadCatalog();loadHistory();loadStorage();showStatus('ok','Przywrócono poprzednią wersję katalogu.')}
  catch(e){if(e.code==='catalog_conflict')setConflict(true);showStatus('error',describe(e)+(e.body?.errors?.length?' '+e.body.errors.slice(0,3).map(errorText).join('; '):''))}
 }});

 if(fatal)return <main className="adm-fatal" role="alert"><div className="adm-brand">SHUTTER<span>.</span> <em>ADMIN</em></div><p>{fatal}</p><button type="button" className="adm-btn" onClick={()=>location.reload()}>Odśwież</button></main>;
 if(!session||!draft)return <main className="adm-fatal" role="status"><div className="adm-brand">SHUTTER<span>.</span> <em>ADMIN</em></div><p className="adm-muted">Wczytywanie…</p></main>;
 return <div className="adm-shell">
  <aside className="adm-side">
   <div className="adm-brand">SHUTTER<span>.</span> <em>ADMIN</em></div>
   <nav aria-label="Sekcje panelu">{TABS.map(([id,label,Icon])=><button key={id} type="button" className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}><Icon size={17}/><span>{label}</span>{id==='upload'&&uploading&&<i className="adm-dot" aria-label="wysyłanie w toku"/>}</button>)}</nav>
   <div className="adm-user"><small>Zalogowano jako</small><strong>{session.email}</strong><a href="/cdn-cgi/access/logout" className="adm-link">Wyloguj</a></div>
  </aside>
  <main className="adm-main">
   <div className={`adm-publishbar${dirty?' dirty':''}`} role="region" aria-label="Publikacja">
    <span>{dirty?'Masz nieopublikowane zmiany w katalogu.':remote.exists?'Wersja robocza zgodna z opublikowanym katalogiem.':'Katalog nie został jeszcze opublikowany.'}</span>
    <div>
     {dirty&&<button type="button" className="adm-btn adm-btn-sm adm-btn-ghost" onClick={discard} disabled={busy}>Odrzuć zmiany</button>}
     <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={publish} disabled={busy||uploading||(!dirty&&remote.exists)}>{busy?'Publikowanie…':'Opublikuj katalog'}</button>
    </div>
   </div>
   {conflict&&<div className="adm-banner adm-banner-error" role="alert"><AlertTriangle size={16}/> Katalog został zmieniony w innej sesji. Twoja wersja nie nadpisała tych zmian. <button type="button" className="adm-link" onClick={reloadLatest}>Wczytaj najnowszą wersję</button></div>}
   {status&&<div className={`adm-banner adm-banner-${status.type}`} role={status.type==='error'?'alert':'status'}>{status.text}<button type="button" className="adm-icon" aria-label="Zamknij komunikat" onClick={clearStatus}><X size={14}/></button></div>}
   {errors.length>0&&<div className="adm-banner adm-banner-error" role="alert"><div><strong>Błędy walidacji ({errors.length}):</strong><ul className="adm-plain">{errors.slice(0,12).map((e,i)=><li key={i}>{errorText(e)}</li>)}</ul></div></div>}
   {tab==='dashboard'&&<Dashboard remote={remote} draft={draft} storage={storage} dirty={dirty} onTab={setTab}/>}
   <div hidden={tab!=='upload'}><UploadView queue={queue} setQueue={setQueue} draft={draft} addTracks={addTracks} coverChoices={coverChoices} showStatus={showStatus}/></div>
   {tab==='catalog'&&<CatalogView draft={draft} setDraft={setDraft} errors={errors} coverChoices={coverChoices} confirm={setDialog} showStatus={showStatus}/>}
   {tab==='storage'&&<StorageView storage={storage} draft={draft} remote={remote} reload={loadStorage} confirm={setDialog} showStatus={showStatus} addTracks={addTracks}/>}
   {tab==='history'&&<HistoryView history={history} dirty={dirty} rollback={rollback} reload={loadHistory}/>}
  </main>
  <Dialog dialog={dialog} onClose={()=>setDialog(null)}/>
 </div>;
}
