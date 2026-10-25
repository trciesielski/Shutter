export const VISUAL_MODES=[['auto','Auto'],['minimal','Minimal'],['cover','Cover Motion'],['orb','Glass Orb'],['particles','Particle Glass'],['mirage','Glass Mirage']];
export function resolveVisualMode(mode,hasCover,reducedMotion){
 if(mode!=='auto')return VISUAL_MODES.some(([id])=>id===mode)?mode:'minimal';
 if(reducedMotion)return hasCover?'cover':'minimal';
 return hasCover?'cover':'mirage';
}
