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
 const avg=(a,b)=>{const section=bins.slice(a,b).map(v=>Number(v)||0);if(!section.length)return 0;const mean=section.reduce((sum,v)=>sum+v,0)/section.length;return (mean*.55+Math.max(...section)*.45)/100};
 return {bass:avg(0,12),mids:avg(12,24),treble:avg(24,32)};
}

/**
 * Browser-independent fallback for Android devices that return zeroed frequency
 * arrays despite providing real PCM samples. Goertzel measures actual audio
 * samples in 32 logarithmic frequency bands; it never synthesizes animation.
 */
export function pcmSpectrumBands(samples,sampleRate=44100){
 const n=samples.length;
 if(!n||!Number.isFinite(sampleRate)||sampleRate<=0)return Array(32).fill(0);
 const result=[];
 const windowed=new Float32Array(n);
 for(let j=0;j<n;j++)windowed[j]=samples[j]*(.5-.5*Math.cos(2*Math.PI*j/(n-1)));
 for(let i=0;i<32;i++){
  const low=35*Math.pow(15000/35,i/32);
  const high=35*Math.pow(15000/35,(i+1)/32);
  let best=0;
  for(let k=0;k<3;k++){
   const freq=low*Math.pow(high/low,(k+.5)/3);
   const omega=2*Math.PI*freq/sampleRate,coef=2*Math.cos(omega);
   let s0=0,s1=0,s2=0;
   for(let j=0;j<n;j++){s0=windowed[j]+coef*s1-s2;s2=s1;s1=s0}
   const amp=2*Math.sqrt(Math.max(0,s1*s1+s2*s2-coef*s1*s2))/n;
   best=Math.max(best,amp);
  }
  // Converts measured sinusoid amplitude to 0..100, preserving silence.
  result.push(clamp(320*Math.sqrt(best*3),0,100));
 }
 return result;
}
