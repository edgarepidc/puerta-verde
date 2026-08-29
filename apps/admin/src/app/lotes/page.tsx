import { redirect } from 'next/navigation';

/** Lotes / PTI oculto del uso diario; redirige a Números. */
export default function LotesPage() {
  redirect('/numeros');
}
