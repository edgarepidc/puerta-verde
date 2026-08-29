import { redirect } from 'next/navigation';

/** Compras vive en /compras. Conserva query (tab, product, etc.). */
export default async function InventarioRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const section = typeof params.section === 'string' ? params.section : undefined;
  const tab = typeof params.tab === 'string' ? params.tab : undefined;
  if (section === 'reposicion' || tab === 'reposicion') {
    redirect('/numeros');
  }

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'section') continue;
    if (typeof value === 'string' && value) qs.set(key, value);
  }
  redirect(qs.size ? `/compras?${qs.toString()}` : '/compras');
}
