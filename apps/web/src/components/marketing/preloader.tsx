import { PreloaderController } from './preloader-controller';

/**
 * Runs before first paint: skips the preloader for returning visitors in this tab session and for
 * people who prefer reduced motion; otherwise holds the hero reveal until the preloader lifts.
 * A timer lifts it after 6s whatever happens, so a failed script never leaves the page covered.
 */
const BOOT = `(function(){var d=document.documentElement;try{var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduce||sessionStorage.getItem('af-preloaded')){d.classList.add('preloader-skip');return}d.classList.add('preloading');setTimeout(function(){d.classList.remove('preloading')},6000)}catch(e){d.classList.add('preloader-skip')}})();`;

/** Logo line-draw and a load counter, shown once per visit while the hero media loads. */
export function Preloader() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      <div id="af-preloader" className="preloader" aria-hidden>
        <svg viewBox="0 0 64 64" className="preloader-logo" fill="none">
          <defs>
            <linearGradient id="af-pre-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--brand-from)" />
              <stop offset="1" stopColor="var(--brand-to)" />
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="58" height="58" rx="17" pathLength={1} className="preloader-stroke" stroke="url(#af-pre-g)" strokeWidth="2.5" />
          <path d="M19 45 30 17h4l11 28h-6.4l-2.4-6.6h-8.6L25.4 45H19Zm10.6-12h4.8L32 26.2 29.6 33Z" pathLength={1} className="preloader-stroke preloader-glyph" stroke="var(--foreground)" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="m47 15 1.4 3.6L52 20l-3.6 1.4L47 25l-1.4-3.6L42 20l3.6-1.4L47 15Z" pathLength={1} className="preloader-stroke preloader-spark" stroke="url(#af-pre-g)" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        <div className="preloader-meta">
          <span className="font-display text-lg italic text-muted-foreground">AdForge Studio</span>
          <span className="font-mono text-sm tabular-nums text-foreground">
            <span data-preloader-count>0</span>%
          </span>
        </div>
        <div className="preloader-bar">
          <span data-preloader-bar />
        </div>
      </div>
      <PreloaderController />
    </>
  );
}
