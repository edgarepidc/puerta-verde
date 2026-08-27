import { redirect } from 'next/navigation';

/** Lotes / PTI oculto del uso diario; redirige a inventario. */
export default function LotesPage() {
  redirect('/?section=stock');
}
