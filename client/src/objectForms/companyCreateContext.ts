import { createContext } from 'react';
import type { CompanyOption } from './companyForm.js';

/** Opens the New company form in place; resolves with the created company, or null on cancel. */
export type RequestCompanyCreate = (name: string) => Promise<CompanyOption | null>;

export const CompanyCreateContext = createContext<RequestCompanyCreate | null>(null);
