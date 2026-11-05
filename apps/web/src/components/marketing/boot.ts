/**
 * Before first paint: marks the page as welcoming motion (scroll reveals start hidden), unless the
 * visitor prefers reduced motion. If the app script has not started 8s later, everything shows.
 */
export const MOTION_BOOT = `(function(){var d=document.documentElement;try{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;d.classList.add('motion-ok');setTimeout(function(){if(!d.hasAttribute('data-motion-ready'))d.classList.remove('motion-ok')},8000)}catch(e){}})();`;
