import { redirect } from 'next/navigation';

/** Pronósticos quedó integrado en Ventas → Transacciones y pronóstico. */
export default function PronosticosRedirectPage() {
  redirect('/?section=stock');
}
