import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { AreaPageCompany } from '@cornerstone/shared';
import { RelatedList } from '../../components/RelatedList/index.js';
import type { RelatedListRow } from '../../components/RelatedList/index.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import type { OriginState } from '../../navigation/origin.js';

export interface AreaCompaniesListProps {
  readonly companies: readonly AreaPageCompany[];
  readonly areaName: string;
  readonly originState: OriginState;
}

/** Companies here: who works on or supplies this area and below (read-only, with Call). */
export function AreaCompaniesList({ companies, areaName, originState }: AreaCompaniesListProps) {
  const { t } = useTranslation('areas');
  const { t: tSettings } = useTranslation('settings');

  const rows: RelatedListRow[] = companies.map((company) => {
    const counts: string[] = [];
    if (company.workItemCount > 0) {
      counts.push(t('index.delete.taskCount', { count: company.workItemCount }));
    }
    if (company.householdItemCount > 0) {
      counts.push(t('index.delete.purchaseCount', { count: company.householdItemCount }));
    }
    const parts: string[] = [];
    if (company.trade) {
      parts.push(
        getCategoryDisplayName(tSettings, company.trade.name, company.trade.translationKey),
      );
    }
    if (counts.length > 0) parts.push(t('detail.companies.here', { counts: counts.join(' · ') }));
    return {
      id: company.id,
      title: company.name,
      to: routeUrl('company', { id: company.id }),
      ...(parts.length > 0 ? { facts: parts.join(' · ') } : {}),
      ...(company.phone ? { call: { phone: company.phone, name: company.name } } : {}),
    };
  });

  return (
    <RelatedList
      title={t('detail.sections.companies')}
      rows={rows}
      emptyMessage={t('detail.companies.empty', { area: areaName })}
      linkState={originState}
      testId="area-companies"
    />
  );
}
