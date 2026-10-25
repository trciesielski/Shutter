import React,{useState} from 'react';
import {FREQUENCIES,PRESETS} from './useEqualizer.js';
import './equalizer.css';
export default function EqualizerPanel({eq}){
 const [name,setName]=useState('');
 const {settings,bins,ready,setBand,setPreamp,applyPreset,savePreset,toggle}=eq;
 return <section className="eq-page">
  <div className="page-heading"><span className="eyebrow muted">SHUTTER AUDIO ENGINE</span><h1>Equalizer PRO</h1><p>10-pasmowy korektor dźwięku z rzeczywistym przetwarzaniem Web Audio.</p></div>
  <div className="eq-panel">
   <div className="eq-toolbar"><div><h2>Equalizer</h2><small>{ready?'Silnik audio gotowy':'Wybierz lokalny utwór i uruchom odtwarzanie'}</small></div>
   <button className={settings.enabled?'eq-toggle enabled':'eq-toggle'} onClick={toggle} aria-pressed={settings.enabled}>{settings.enabled?'EQ ON':'EQ OFF'}</button></div>
   <div className="eq-presets">{Object.keys({...PRESETS,...settings.custom}).map(p=><button key={p} className={settings.preset===p?'selected':''} onClick={()=>applyPreset(p)}>{p}</button>)}</div>
   <div className="eq-spectrum" aria-label="Analizator widma dźwięku"><div className="eq-spectrum-bars">{bins.map((v,i)=><span key={i} style={{height:(settings.enabled?v:0)+'%'}}/>)}</div></div>
   <div className="eq-bands">{FREQUENCIES.map((freq,i)=><div className="eq-band" key={freq}>
     <output>{settings.gains[i]>0?'+':''}{settings.gains[i].toFixed(1)}</output>
     <input aria-label={'Pasmo '+freq+' Hz'} type="range" min="-12" max="12" step=".5" value={settings.gains[i]} onChange={e=>setBand(i,Number(e.target.value))} orient="vertical" disabled={!settings.enabled}/>
     <span>{freq>=1000?freq/1000+'k':freq}</span>
   </div>)}</div>
   <div className="eq-preamp"><label htmlFor="eq-preamp">Preamp <strong>{settings.preamp>0?'+':''}{settings.preamp.toFixed(1)} dB</strong></label><input id="eq-preamp" type="range" min="-12" max="6" step=".5" value={settings.preamp} onChange={e=>setPreamp(Number(e.target.value))} disabled={!settings.enabled}/><small>Zmniejsz preamp przy podbiciu wielu pasm, aby ograniczyć przesterowanie.</small></div>
   <div className="eq-save"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Własna nazwa" maxLength={32} aria-label="Nazwa presetu"/><button disabled={!name.trim()} onClick={()=>{savePreset(name);setName('')}}>Zapisz preset</button></div>
  </div><p className="eq-disclaimer">Korektor działa na dźwięku z lokalnych plików odtwarzanych przez Shutter. Nie modyfikuje dźwięku całego systemu. Analizator pokazuje sygnał po filtrach, a nie animację demonstracyjną.</p>
 </section>
}
