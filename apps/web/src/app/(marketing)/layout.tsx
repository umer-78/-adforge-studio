import { MOTION_BOOT } from '@/components/marketing/boot';
import { Cursor } from '@/components/marketing/cursor';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';
import { SmoothScroll } from '@/components/marketing/smooth-scroll';

/** Public pages: the landing page and the legal pages. */
export default function MarketingLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />
      <SmoothScroll>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
          Skip to content
        </a>
        <SiteHeader />
        <div id="main">{children}</div>
        <SiteFooter />
        <Cursor />
      </SmoothScroll>
    </>
  );
}
