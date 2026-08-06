import { OnboardingForm } from '@/components/OnboardingForm';

export default function RegistroPage() {
  return (
    <>
      <div className="pv-ambient" aria-hidden />
      <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
        <OnboardingForm />
      </main>
    </>
  );
}
