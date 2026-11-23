import type { Metadata } from 'next';

import { getCurrentUser } from '@/lib/auth';
import { HeroSection } from '@/components/landing/hero-section';
import { ValueSection } from '@/components/landing/value-section';
import { WorkflowSection } from '@/components/landing/workflow-section';
import { LimitsSection } from '@/components/landing/limits-section';
import { LandingMotion } from '@/components/landing/landing-motion';

export const metadata: Metadata = { title: 'Torfun | ค้นหาโอกาสจาก TOR ด้านซอฟต์แวร์' };

export default async function Home() {
  // Deliberately not gated. This is the public page describing the product, and
  // a signed-in officer comes back to it from the logo, a bookmark, or a shared
  // link. Redirecting them to the dashboard would send an officer without a
  // Company on to the sign-up flow. When signed in, only the call to action
  // changes.
  const signedIn = (await getCurrentUser()) !== null;
  // The sections stay server components; `LandingMotion` only wraps them so its
  // GSAP triggers have one scope to query within.
  return (
    <LandingMotion>
      <main>
        <HeroSection signedIn={signedIn} />
        <ValueSection />
        <WorkflowSection />
        <LimitsSection signedIn={signedIn} />
      </main>
    </LandingMotion>
  );
}
