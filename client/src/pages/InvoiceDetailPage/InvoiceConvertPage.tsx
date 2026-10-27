import { useEffect, useMemo } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import {
  groupForDocument,
  rowFromInvoiceLine,
  useInvoiceCostLines,
} from '../../components/CostLineTable/index.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FormError } from '../../components/FormError/FormError.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { useLocale } from '../../contexts/LocaleContext.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useInvoiceDisplayTitle } from '../../hooks/useInvoiceDisplayTitle.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUserText } from '../../hooks/useUserText.js';
import { focusPageHeading, focusPageHeadingWhenReady } from '../../lib/focusPageHeading.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { pathnameOf, readOrigin } from '../../navigation/origin.js';
import { ConvertOfferForm } from './ConvertOfferForm.js';
import styles from './InvoiceConvertPage.module.css';
import { useInvoiceRecord } from './useInvoiceRecord.js';

/** Reads the route id once; the view below always has an offer id. */
export function InvoiceConvertPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={routeUrl('invoices')} replace />;
  return <InvoiceConvertView id={id} />;
}

function InvoiceConvertView({ id }: { id: string }) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const userText = useUserText();
  const statusVariants = useStatusBadgeVariants();
  const { vatRate } = useLocale();
  const record = useInvoiceRecord(id);
  const costLines = useInvoiceCostLines(id);
  const { invoice } = record;
  const offerTitle = useInvoiceDisplayTitle(invoice);

  const loading = record.isLoading || costLines.loading;
  const failure = record.error ?? costLines.error;
  const isOffer = invoice?.status === 'quotation';
  const notFound = !loading && (record.notFound || (invoice !== null && !isOffer));
  const ready = !loading && !failure && isOffer;

  const h1Text = notFound
    ? t('convertPage.notFoundTitle')
    : ready
      ? t('convertPage.title')
      : t('convertPage.loadingTitle');
  useDocumentTitle(h1Text);

  const rows = useMemo(
    () =>
      costLines.lines.map((line) =>
        rowFromInvoiceLine(
          line,
          { id, status: 'quotation', invoiceNumber: null, date: null, vendorName: null },
          vatRate,
          costLines.sources,
        ),
      ),
    [costLines.lines, costLines.sources, id, vatRate],
  );
  const groups = useMemo(() => groupForDocument(rows), [rows]);

  // Arriving on the page puts focus on its heading.
  useEffect(() => {
    if (ready) focusPageHeading();
  }, [ready]);

  /** Back to the offer: one step back when this page was opened from it, else replace. */
  const returnToInvoice = () => {
    const invoiceUrl = routeUrl('invoice', { id });
    if (pathnameOf(readOrigin(location.state)?.to ?? '') === invoiceUrl) navigate(-1);
    else navigate(invoiceUrl, { replace: true });
    // The offer page renders after the navigation (often behind its loading state).
    focusPageHeadingWhenReady(180);
  };

  const breadcrumbs = <PageBreadcrumbs objectNames={{ invoice: offerTitle }} />;

  if (loading) {
    return (
      <PageLayout title={h1Text} maxWidth="wide" breadcrumbs={breadcrumbs}>
        <Skeleton lines={5} />
      </PageLayout>
    );
  }

  if (notFound) {
    const action = record.notFound
      ? {
          label: tc('navigation.backTo', { origin: tc('navigation.invoices') }),
          href: routeUrl('invoices'),
        }
      : { label: t('convertPage.openInvoice'), href: routeUrl('invoice', { id }) };
    return (
      <PageLayout title={h1Text} maxWidth="wide" breadcrumbs={breadcrumbs}>
        <div data-testid={record.notFound ? 'convert-not-found' : 'convert-not-offer'}>
          <EmptyState
            message={record.notFound ? t('convertPage.notFound') : t('convertPage.notAnOffer')}
            action={action}
          />
        </div>
      </PageLayout>
    );
  }

  if (!ready) {
    return (
      <PageLayout title={h1Text} maxWidth="wide" breadcrumbs={breadcrumbs}>
        <div className={styles.stateCard} data-testid="convert-error">
          <FormError message={failure} />
          <button
            type="button"
            className={styles.retry}
            onClick={() => {
              void record.reload();
              void costLines.reload();
            }}
            data-testid="convert-retry"
          >
            {t('convertPage.retry')}
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={h1Text}
      maxWidth="wide"
      breadcrumbs={breadcrumbs}
      subtitle={
        <span className={styles.subtitle}>
          <span {...userText()}>{offerTitle}</span>
          <Badge variants={statusVariants.invoice} value="quotation" />
        </span>
      }
    >
      <p className={styles.intro}>{t('convertPage.intro')}</p>
      <ConvertOfferForm
        invoice={invoice!}
        rows={rows}
        groups={groups}
        budgetSources={costLines.budgetSources}
        onDone={returnToInvoice}
        onNotOffer={() => void record.refresh()}
      />
    </PageLayout>
  );
}

export default InvoiceConvertPage;
