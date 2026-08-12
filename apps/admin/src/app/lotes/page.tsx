import { redirect } from 'next/navigation';

/** Lotes / PTI oculto del uso diario; redirige a Inventario. */
export default function LotesPage() {
  redirect('/inventario');
}
