import { redirect } from 'next/navigation';

/** Qué comprar vive en Productos. */
export default function PronosticosRedirectPage() {
  redirect('/productos#que-comprar');
}
