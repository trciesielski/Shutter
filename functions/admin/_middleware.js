import {guardAdminPage} from '../../server/adminPage.js';

export const onRequest=context=>guardAdminPage(context);
