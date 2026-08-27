import { redirect } from 'next/navigation';

const DEMO_SLUG = process.env.NEXT_PUBLIC_DEMO_BRANCH_SLUG ?? 'la-cite';

export default function HomePage() {
  redirect(`/${DEMO_SLUG}`);
}
