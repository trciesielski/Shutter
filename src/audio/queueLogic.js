export function nextIndex({length,index,shuffle=false,repeat='off',history=[]},atEnd=false){
 if(length<1)return -1;
 if(repeat==='one'&&atEnd)return index;
 if(shuffle&&length>1){const choices=Array.from({length},(_,i)=>i).filter(i=>i!==index);return choices[Math.floor(Math.random()*choices.length)]}
 if(index+1<length)return index+1;
 return repeat==='all'?0:-1;
}
export function previousIndex({length,index,history=[]}){
 if(length<1)return -1;
 if(history.length)return history[history.length-1];
 return Math.max(0,index-1);
}
export function reordered(ids,source,target){const copy=[...ids];const from=copy.indexOf(source),to=copy.indexOf(target);if(from<0||to<0)return ids;copy.splice(from,1);copy.splice(to,0,source);return copy}

export function shuffledQueue(ids,currentId,random=Math.random){
 const remaining=ids.filter(id=>id!==currentId);
 for(let i=remaining.length-1;i>0;i--){const j=Math.max(0,Math.min(i,Math.floor(random()*(i+1))));[remaining[i],remaining[j]]=[remaining[j],remaining[i]]}
 return currentId&&ids.includes(currentId)?[currentId,...remaining]:remaining;
}
