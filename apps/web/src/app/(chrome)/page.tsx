import { getCurrentUser } from '@/lib/auth';
import type { Metadata } from 'next';
import { HeroSection } from '@/components/landing/hero-section';
import { FeaturesSection } from '@/components/landing/features-section';
import { WorkflowSection } from '@/components/landing/workflow-section';
import { CtaSection } from '@/components/landing/cta-section';
import { SiteFooter } from '@/components/landing/site-footer';
export const metadata: Metadata = { title: 'Torfun | ค้นหาโอกาสจาก TOR ด้านซอฟต์แวร์' };
export default async function Home() {
  // Deliberately not gated. This is the public page describing the product, and
  // a signed-in officer has every reason to come back to it — from the logo in
  // the navbar, from a bookmark, from a link a colleague sent. It used to
  // redirect them to the dashboard, which for an officer without a Company
  // bounced on again to the sign-up flow, so following a link to the marketing
  // page landed you in a form. What changes when signed in is the call to
  // action, not whether the page is allowed to render.
  const signedIn = (await getCurrentUser()) !== null;
  return (
    <>
      <main>
        <HeroSection signedIn={signedIn} />
        <FeaturesSection />
        <WorkflowSection />
        <CtaSection signedIn={signedIn} />
      </main>
      <SiteFooter />
    </>
  );
}
