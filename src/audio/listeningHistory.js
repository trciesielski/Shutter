const KEY='shutter-listening-history-v1';
const limit=500;
export function readHistory(){try{return JSON.parse(localStorage.getItem(KEY)||'[]').filter(x=>x&&x.id).slice(0,limit)}catch{return []}}
export function recordListen(song){if(!song)return;try{const all=readHistory();all.unshift({id:song.id,title:song.title,artist:song.artist,at:Date.now()});localStorage.setItem(KEY,JSON.stringify(all.slice(0,limit)));return all.slice(0,limit)}catch{return []}}
export function historyStats(rows){const plays={};for(const row of rows)plays[row.id]=(plays[row.id]||0)+1;return Object.entries(plays).sort((a,b)=>b[1]-a[1])}
export function clearHistory(){try{localStorage.removeItem(KEY)}catch{}}
