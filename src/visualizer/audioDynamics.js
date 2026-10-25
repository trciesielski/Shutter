const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,Number.isFinite(x)?x:0));
export const EIGHT_BAND_RANGES=[[0,3],[3,6],[6,10],[10,14],[14,18],[18,22],[22,27],[27,32]];
export function spectralFeatures(bins,previous=null){
 const v=Array.from({length:32},(_,i)=>clamp(Number(bins?.[i]||0)/100));
 const bands=EIGHT_BAND_RANGES.map(([a,b])=>{let total=0,peak=0;for(let i=a;i<b;i++){total+=v[i];peak=Math.max(peak,v[i])}return total/(b-a)*.6+peak*.4});
 const old=previous||Array(32).fill(0);
 let flux=0,total=0,weighted=0;
 for(let i=0;i<32;i++){flux+=Math.max(0,v[i]-clamp(old[i]||0));total+=v[i];weighted+=v[i]*i}
 return {raw:v,bands,flux:clamp(flux/32*5),centroid:total?weighted/(total*31):0,energy:total/32};
}
export function updateVisualDynamics(state,features,dtMs){
 const seconds=clamp(dtMs,1,100)/1000;
 const previous=state||{sustain:Array(8).fill(0),transient:Array(8).fill(0),baseline:Array(8).fill(0),beat:0,flux:0};
 const sustain=[],transient=[],baseline=[];
 for(let i=0;i<8;i++){
  const x=features.bands[i]||0,was=previous.sustain[i]||0,base=previous.baseline[i]||0;
  const follow=1-Math.exp(-seconds/(x > was ? .06 : .22));
  sustain[i]=was+(x-was)*follow;
  baseline[i]=base+(x-base)*(1-Math.exp(-seconds/.75));
  const impulse=Math.max(0,x-base)*1.8;
  transient[i]=Math.max(impulse,(previous.transient[i]||0)*Math.exp(-seconds/.18));
 }
 const hit=clamp(Math.max(transient[0],transient[1],transient[2],features.flux*1.4));
 return {sustain,transient,baseline,beat:Math.max(hit,previous.beat*Math.exp(-seconds/.22)),flux:features.flux};
}
