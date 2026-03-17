import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import all translation files statically
import enCommon from './en/common.json';
import enErrors from './en/errors.json';
import enAuth from './en/auth.json';
import enDashboard from './en/dashboard.json';
import enWorkItems from './en/workItems.json';
import enHouseholdItems from './en/householdItems.json';
import enBudget from './en/budget.json';
import enSchedule from './en/schedule.json';
import enDiary from './en/diary.json';
import enDocuments from './en/documents.json';
import enSettings from './en/settings.json';

import deCommon from './de/common.json';
import deErrors from './de/errors.json';
import deAuth from './de/auth.json';
import deDashboard from './de/dashboard.json';
import deWorkItems from './de/workItems.json';
import deHouseholdItems from './de/householdItems.json';
import deBudget from './de/budget.json';
import deSchedule from './de/schedule.json';
import deDiary from './de/diary.json';
import deDocuments from './de/documents.json';
import deSettings from './de/settings.json';

const resources = {
  en: {
    common: enCommon,
    errors: enErrors,
    auth: enAuth,
    dashboard: enDashboard,
    workItems: enWorkItems,
    householdItems: enHouseholdItems,
    budget: enBudget,
    schedule: enSchedule,
    diary: enDiary,
    documents: enDocuments,
    settings: enSettings,
  },
  de: {
    common: deCommon,
    errors: deErrors,
    auth: deAuth,
    dashboard: deDashboard,
    workItems: deWorkItems,
    householdItems: deHouseholdItems,
    budget: deBudget,
    schedule: deSchedule,
    diary: deDiary,
    documents: deDocuments,
    settings: deSettings,
  },
};

function detectBrowserLocale(): string {
  const lang = navigator.language ?? navigator.languages?.[0] ?? 'en';
  if (lang.startsWith('de')) return 'de';
  return 'en';
}

function readStoredLocale(): string | null {
  try {
    const stored = localStorage.getItem('locale');
    if (stored === 'en' || stored === 'de') return stored;
    if (stored === 'system') return detectBrowserLocale();
  } catch {
    // localStorage unavailable
  }
  return null;
}

const initialLocale = readStoredLocale() ?? detectBrowserLocale();

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: [
    'common',
    'errors',
    'auth',
    'dashboard',
    'workItems',
    'householdItems',
    'budget',
    'schedule',
    'diary',
    'documents',
    'settings',
  ],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
