// Real R2 semantics (conditional puts, multipart, list) from Miniflare's local R2 simulator.
import {Miniflare} from 'miniflare';
export async function localBucket(){
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response(null)}}',r2Buckets:['MUSIC_BUCKET']});
 const bucket=await mf.getR2Bucket('MUSIC_BUCKET');
 return {bucket,dispose:()=>mf.dispose()};
}
