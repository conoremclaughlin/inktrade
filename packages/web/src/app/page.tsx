import { Navbar } from '@/components/navbar';
import { Hero } from '@/components/hero';
import { Ticker } from '@/components/ticker';
import { Features } from '@/components/features';
import { CalculatorPreview } from '@/components/calculator-preview';
import { Metrics } from '@/components/metrics';
import { CTA } from '@/components/cta';
import { Footer } from '@/components/footer';

export default function Home() {
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
