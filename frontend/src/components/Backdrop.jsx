import { useGsap } from '../anim/hooks'
import { EASE, gsap } from '../anim/motion'

/**
 * Ambient layer behind the whole app: four slowly drifting colour fields, a
 * masked grid, a vignette and film grain. Purely decorative —
 * `pointer-events: none`.
 */
export default function Backdrop() {
  const scope = useGsap(() => {
    // Each blob gets its own irregular drift so they never visibly loop
    // together. Long durations keep the CPU cost near zero.
    const drifts = [
      { sel: '.a1', x: 90, y: 60, t: 22 },
      { sel: '.a2', x: -110, y: 80, t: 27 },
      { sel: '.a3', x: 70, y: -70, t: 31 },
      { sel: '.a4', x: -60, y: -90, t: 37 },
    ]

    drifts.forEach(({ sel, x, y, t }) => {
      gsap.to(sel, {
        x,
        y,
        scale: 1.12,
        duration: t,
        ease: EASE.soft,
        repeat: -1,
        yoyo: true,
      })
    })

    gsap.fromTo(
      '.aurora',
      { opacity: 0 },
      { opacity: 0.5, duration: 1.6, stagger: 0.15, ease: EASE.out },
    )
  }, [])

  return (
    <div className="backdrop" ref={scope} aria-hidden="true">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="aurora a3" />
      <div className="aurora a4" />
      <div className="grid" />
      <div className="vignette" />
      <div className="grain" />
    </div>
  )
}
