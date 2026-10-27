// Single source of truth for platform-specific behaviour.
// Anything other than an explicit "mobile" build is treated as the public, read-only web player.
export const PLATFORMS=Object.freeze(['web','mobile']);

export function resolvePlatform(value){
 return String(value??'').trim().toLowerCase()==='mobile'?'mobile':'web';
}

export function platformCapabilities(platform){
 const mobile=resolvePlatform(platform)==='mobile';
 return Object.freeze({
  platform:mobile?'mobile':'web',
  publicCatalog:!mobile,
  localImport:mobile,
  localDelete:mobile,
  localPersistence:mobile
 });
}

export const PLATFORM=resolvePlatform(import.meta.env?.VITE_PLATFORM);
export const CAPABILITIES=platformCapabilities(PLATFORM);
