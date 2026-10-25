// Constant perceived power for independent, uncorrelated music signals.
export function equalPowerCurves(points=128){
 const n=Math.max(2,Math.round(points)),fadeOut=new Float32Array(n),fadeIn=new Float32Array(n);
 for(let i=0;i<n;i++){const angle=(i/(n-1))*Math.PI/2;fadeOut[i]=Math.cos(angle);fadeIn[i]=Math.sin(angle)}
 return {fadeOut,fadeIn};
}
