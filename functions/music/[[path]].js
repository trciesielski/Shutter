import {handleMediaRequest} from '../../server/r2PublicMedia.js';

export const onRequest=context=>handleMediaRequest(context);
