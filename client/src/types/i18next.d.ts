import 'i18next';

import type enAreas from '../i18n/en/areas.json';
import type enAuth from '../i18n/en/auth.json';
import type enBudget from '../i18n/en/budget.json';
import type enCommon from '../i18n/en/common.json';
import type enDashboard from '../i18n/en/dashboard.json';
import type enDiary from '../i18n/en/diary.json';
import type enDocuments from '../i18n/en/documents.json';
import type enErrors from '../i18n/en/errors.json';
import type enHouseholdItems from '../i18n/en/householdItems.json';
import type enPhotoAnnotator from '../i18n/en/photoAnnotator.json';
import type enPhotoViewer from '../i18n/en/photoViewer.json';
import type enSchedule from '../i18n/en/schedule.json';
import type enSettings from '../i18n/en/settings.json';
import type enWorkItems from '../i18n/en/workItems.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    returnNull: false;
    nsSeparator: ':';
    keySeparator: '.';
    enableSelector: 'strict';
    resources: {
      areas: typeof enAreas;
      auth: typeof enAuth;
      budget: typeof enBudget;
      common: typeof enCommon;
      dashboard: typeof enDashboard;
      diary: typeof enDiary;
      documents: typeof enDocuments;
      errors: typeof enErrors;
      householdItems: typeof enHouseholdItems;
      photoAnnotator: typeof enPhotoAnnotator;
      photoViewer: typeof enPhotoViewer;
      schedule: typeof enSchedule;
      settings: typeof enSettings;
      workItems: typeof enWorkItems;
    };
  }
}
