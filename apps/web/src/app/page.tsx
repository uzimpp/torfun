import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { HeroSection } from '@/components/landing/hero-section';
import { FeaturesSection } from '@/components/landing/features-section';
import { WorkflowSection } from '@/components/landing/workflow-section';
import { CtaSection } from '@/components/landing/cta-section';
import { SiteFooter } from '@/components/landing/site-footer';
export const metadata: Metadata = { title: 'Torfun | ค้นหาโอกาสจาก TOR ด้านซอฟต์แวร์' };
export default async function Home() {
  if (await getCurrentUser()) redirect('/dashboard');
  return (
    <>
      <main>
        <HeroSection />
        <FeaturesSection />
        <WorkflowSection />
        <CtaSection />
      </main>
      <SiteFooter />
    </>
  );
}
