import { Navbar } from '@/components/navbar';
import { Hero } from '@/components/hero';
import { Ticker } from '@/components/ticker';
import { Features } from '@/components/features';
import { CalculatorPreview } from '@/components/calculator-preview';
import { Metrics } from '@/components/metrics';
import { CTA } from '@/components/cta';
import { Footer } from '@/components/footer';
import { Dashboard } from '@/components/dashboard/dashboard';
import { createClient } from '@/lib/supabase/server';

/**
 * One URL, two front doors.
 *
 * Signed out, `/` is the pitch. Signed in, it is the account — nobody who has
 * already bought in wants to be sold to every time they open the app. Resolved
 * on the server so a signed-in visitor never sees the marketing page flash
 * before being swapped out.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return <Dashboard />;

  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Ticker />
        <Features />
        <CalculatorPreview />
        <Metrics />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
