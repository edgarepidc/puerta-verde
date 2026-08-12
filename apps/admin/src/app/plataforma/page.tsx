import { redirect } from 'next/navigation';

/** Plataforma vive dentro de Configuración (solo super admin). */
export default function PlataformaPage() {
  redirect('/configuracion#plataforma');
}
