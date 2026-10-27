import {handleAdminApi} from '../../../server/adminApi.js';

export const onRequest=context=>handleAdminApi(context);
