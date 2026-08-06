import { redirect } from 'next/navigation';

const DEMO_SLUG = process.env.NEXT_PUBLIC_DEMO_BRANCH_SLUG ?? 'puerta-verde-demo';

/** Public self-service signup disabled — verdulerías se crean desde el panel Plataforma. */
export default function RegistroPage() {
  redirect(`/${DEMO_SLUG}`);
}
