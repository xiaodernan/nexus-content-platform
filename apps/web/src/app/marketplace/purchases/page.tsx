import { getLocale } from '@/lib/i18n';
import { PurchasesClient } from './PurchasesClient';

export const dynamic = 'force-dynamic';

export default async function PurchasesPage() {
  const locale = await getLocale();
  return <PurchasesClient locale={locale} />;
}
