import {useEffect,useState} from 'react';
export const GLASS_DEFAULTS={opacity:33,blur:9,glow:35};
const KEY='shutter-glass-look-v1';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
function restore(){try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return {opacity:clamp(v.opacity??33,5,90),blur:clamp(v.blur??9,0,30),glow:clamp(v.glow??35,0,100)}}catch{return {...GLASS_DEFAULTS}}}
export function useGlassLook(){
 const [look,setLook]=useState(restore);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(look))}catch{}},[look]);
 const update=(key,value)=>setLook(old=>({...old,[key]:clamp(value,key==='opacity'?5:0,key==='opacity'?90:key==='blur'?30:100)}));
 return {look,update,reset:()=>setLook({...GLASS_DEFAULTS})};
}
