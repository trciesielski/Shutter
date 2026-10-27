// Same-origin client for /api/admin/*. Authentication is the Cloudflare Access session cookie;
// no credentials are stored in or sent from this code.
export const API_BASE='/api/admin/';

export class ApiError extends Error{
 constructor(status,code,body){super(code);this.name='ApiError';this.status=status;this.code=code;this.body=body||{}}
}

export async function api(path,{method='GET',body,signal}={}){
 const headers={Accept:'application/json'};
 if(method!=='GET')headers['X-Shutter-Admin']='1';
 const init={method,headers,credentials:'same-origin',cache:'no-store',signal};
 if(body!==undefined){headers['Content-Type']='application/json';init.body=JSON.stringify(body)}
 let res;
 try{res=await fetch(API_BASE+path,init)}catch(error){if(error?.name==='AbortError')throw error;throw new ApiError(0,'network_error')}
 let data=null;
 try{data=await res.json()}catch{}
 if(!res.ok)throw new ApiError(res.status,data?.error||'http_'+res.status,data);
 return data;
}

export const MESSAGES={
 network_error:'Brak połączenia z serwerem. Sprawdź sieć i spróbuj ponownie.',
 missing_token:'Sesja Cloudflare Access wygasła. Odśwież stronę, aby zalogować się ponownie.',
 token_expired:'Sesja Cloudflare Access wygasła. Odśwież stronę, aby zalogować się ponownie.',
 not_an_administrator:'To konto nie ma uprawnień administratora.',
 admin_not_configured:'Panel administracyjny nie jest skonfigurowany na serwerze.',
 csrf_rejected:'Żądanie odrzucone przez zabezpieczenia panelu.',
 music_storage_not_configured:'Magazyn R2 nie jest podłączony.',
 unsupported_format:'Nieobsługiwany format pliku.',
 mime_mismatch:'Typ pliku nie zgadza się z rozszerzeniem.',
 signature_mismatch:'Zawartość pliku nie odpowiada jego formatowi.',
 verification_failed:'Plik po wysłaniu nie przeszedł weryfikacji i został usunięty.',
 file_too_large:'Plik jest zbyt duży.',
 duplicate:'Ten plik jest już w katalogu.',
 catalog_conflict:'Katalog został w międzyczasie zmieniony w innej sesji.',
 catalog_invalid:'Katalog zawiera błędy i nie został opublikowany.',
 publish_failed:'Publikacja nie powiodła się. Poprzedni katalog pozostał bez zmian.',
 object_referenced:'Plik jest używany przez utwory w katalogu.',
 confirmation_required:'Wymagane potwierdzenie.',
 upload_expired:'Sesja wysyłania wygasła. Rozpocznij wysyłanie od nowa.',
 upload_not_found:'Sesja wysyłania nie istnieje. Rozpocznij wysyłanie od nowa.'
};
export const describe=error=>MESSAGES[error?.code]||(error?.status?`Błąd serwera (${error.code||error.status}).`:'Nieoczekiwany błąd.');
