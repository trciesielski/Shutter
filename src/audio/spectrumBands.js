const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function spectrumBands(bytes,sampleRate=44100){
 const nyquist=sampleRate/2,n=bytes.length;
 return Array.from({length:32},(_,i)=>{
  const lo=30*Math.pow(17000/30,i/32),hi=30*Math.pow(17000/30,(i+1)/32);
  const a=clamp(Math.floor(lo/nyquist*n),0,n-1),b=clamp(Math.ceil(hi/nyquist*n),a+1,n);
  let sum=0,peak=0;
  for(let j=a;j<b;j++){sum+=bytes[j];peak=Math.max(peak,bytes[j])}
  return Math.round(clamp((sum/(b-a)*.75+peak*.25)/255*100,0,100));
 });
}
export function spectrumEnergy(bins){
 const avg=(a,b)=>bins.slice(a,b).reduce((s,n)=>s+Number(n||0),0)/Math.max(1,b-a)/100;
 return {bass:avg(0,12),mids:avg(12,24),treble:avg(24,32)};
}
