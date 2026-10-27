// Seeds the local (Miniflare) R2 bucket used by `wrangler pages dev --r2 MUSIC_BUCKET` for E2E tests.
// Fixtures are generated with ffmpeg; nothing here touches the real Cloudflare account.
import {Miniflare} from 'miniflare';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

const persist=process.argv[2]||'.wrangler/e2e';
const dir=join(persist,'fixtures');mkdirSync(dir,{recursive:true});
const ff=(...args)=>execFileSync('ffmpeg',['-loglevel','error','-y',...args]);
ff('-f','lavfi','-i','sine=frequency=440:duration=20','-b:a','64k',join(dir,'a.mp3'));
ff('-f','lavfi','-i','sine=frequency=660:duration=20','-b:a','64k',join(dir,'b.mp3'));
ff('-f','lavfi','-i','color=c=red:s=64x64','-frames:v','1',join(dir,'c.jpg'));
// Admin upload fixtures (not stored in R2): ID3v2.3 tags with Polish characters and embedded artwork,
// plus a JPEG disguised as .mp3 for the spoofing check.
ff('-f','lavfi','-i','color=c=blue:s=600x600','-frames:v','1',join(dir,'art.jpg'));
ff('-f','lavfi','-i','sine=frequency=550:duration=12','-i',join(dir,'art.jpg'),'-map','0:a','-map','1:v','-c:a','libmp3lame','-b:a','64k','-c:v','copy','-id3v2_version','3','-metadata','title=Zażółć gęślą jaźń','-metadata','artist=Łódzki Kwartet','-metadata','album=Ćwiczenia','-metadata','genre=Jazz','-metadata','date=2024','-metadata','track=3','-disposition:v','attached_pic',join(dir,'tagged.mp3'));
writeFileSync(join(dir,'fake.mp3'),readFileSync(join(dir,'c.jpg')));
const catalog={version:1,title:'SHUTTER',tracks:[
 {id:'t1',title:'Sine A',artist:'Test Artist',album:'E2E',audio:'tracks/a.mp3',cover:'covers/c.jpg',order:1},
 {id:'t2',title:'Sine B',artist:'Test Artist',audio:'tracks/b.mp3',order:2},
 {id:'t3',title:'Missing cover',artist:'Test Artist',audio:'tracks/a.mp3',cover:'covers/none.jpg',order:3},
 {id:'bad',title:'Bad',audio:'javascript:alert(1)'}
]};
writeFileSync(join(dir,'catalog.json'),JSON.stringify(catalog));

const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response(null)}}',r2Buckets:['MUSIC_BUCKET'],r2Persist:join(persist,'v3','r2')});
const bucket=await mf.getR2Bucket('MUSIC_BUCKET');
for(const [key,file] of [['tracks/a.mp3','a.mp3'],['tracks/b.mp3','b.mp3'],['covers/c.jpg','c.jpg'],['catalog/catalog.json','catalog.json']])
 await bucket.put(key,new Uint8Array(readFileSync(join(dir,file))));
await mf.dispose();
console.log('seeded',persist);
