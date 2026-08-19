/**
 * Single place where GSAP is configured, so every animation in the app pulls
 * from the same easing / duration vocabulary and nothing drifts.
 */
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export const REDUCED =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Rather than branching at every call site, collapse the whole timeline for
// users who asked for less motion — end states stay identical.
if (REDUCED) gsap.globalTimeline.timeScale(220)

export const EASE = {
  out: 'power3.out',
  in: 'power2.in',
  inOut: 'power2.inOut',
  pop: 'back.out(1.7)',
  expo: 'expo.out',
  soft: 'sine.inOut',
}

export const DUR = {
  xs: 0.18,
  sm: 0.3,
  md: 0.5,
  lg: 0.75,
  xl: 1.1,
}

/** Standard "content arrives" tween used for staggered groups. */
export const RISE = {
  y: 18,
  opacity: 0,
  duration: DUR.md,
  ease: EASE.out,
}

export { gsap, ScrollTrigger }
