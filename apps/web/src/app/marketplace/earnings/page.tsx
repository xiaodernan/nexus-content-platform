import { getLocale } from '@/lib/i18n';
import { EarningsClient } from './EarningsClient';

export const dynamic = 'force-dynamic';

export default async function EarningsPage() {
  const locale = await getLocale();
  return <EarningsClient locale={locale} />;
}
