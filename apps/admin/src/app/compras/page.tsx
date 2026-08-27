import { redirect } from 'next/navigation';

/** Compras quedó integrado en Inventario → pestaña Compras. */
export default function ComprasRedirectPage() {
  redirect('/inventario');
}
