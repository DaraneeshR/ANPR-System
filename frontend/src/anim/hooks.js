import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DUR, EASE, gsap } from './motion'

/**
 * Scopes a GSAP context to a container ref. The context is reverted on cleanup,
 * so every tween unwinds itself when the component unmounts or deps change —
 * this is what keeps StrictMode's double-invoke from stacking animations.
 */
export function useGsap(setup, deps = []) {
  const scope = useRef(null)

  useLayoutEffect(() => {
    if (!scope.current) return undefined
    const ctx = gsap.context(setup, scope)
    return () => ctx.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return scope
}

/**
 * Tweens a number toward `value` and returns the rounded interim value, so
 * counters roll rather than snap.
 */
export function useCountUp(value, { duration = DUR.lg } = {}) {
  const [display, setDisplay] = useState(value ?? 0)
  const proxy = useRef({ n: value ?? 0 })

  useEffect(() => {
    const target = value ?? 0
    const tween = gsap.to(proxy.current, {
      n: target,
      duration,
      ease: EASE.expo,
      onUpdate: () => setDisplay(Math.round(proxy.current.n)),
    })
    return () => tween.kill()
  }, [value, duration])

  return display
}

/**
 * Moves a floating marker element onto whichever child is currently active —
 * the sliding pill behind the sidebar nav and the segmented filters.
 * `axis: 'y'` tracks offsetTop/height, `'x'` tracks offsetLeft/width.
 */
export function useMarker(activeKey, { axis = 'y', attr = 'data-key' } = {}) {
  const listRef = useRef(null)
  const markerRef = useRef(null)
  const settled = useRef(false)

  useLayoutEffect(() => {
    const list = listRef.current
    const marker = markerRef.current
    if (!list || !marker) return undefined

    const place = () => {
      const el = list.querySelector(`[${attr}="${CSS.escape(String(activeKey))}"]`)
      if (!el) {
        gsap.to(marker, { opacity: 0, duration: DUR.xs })
        return
      }
      const to =
        axis === 'y'
          ? { y: el.offsetTop, height: el.offsetHeight, opacity: 1 }
          : { x: el.offsetLeft - 3, width: el.offsetWidth, opacity: 1 }

      // First placement snaps; later ones glide.
      gsap.to(marker, {
        ...to,
        duration: settled.current ? 0.42 : 0,
        ease: EASE.pop,
      })
      settled.current = true
    }

    place()
    const ro = new ResizeObserver(place)
    ro.observe(list)
    return () => ro.disconnect()
  }, [activeKey, axis, attr])

  return { listRef, markerRef }
}

/**
 * Lights whichever `.card` the cursor is over, tracking its position.
 *
 * One delegated listener for the whole app rather than a hook per card, and
 * writes are coalesced into a single rAF — pointermove fires far faster than
 * the compositor can use, and this never touches React state.
 */
export function useCardSpotlight() {
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return undefined

    let active = null
    let frame = 0
    let pending = null

    const clear = (card) => card?.style.setProperty('--spot', '0')

    const flush = () => {
      frame = 0
      if (!pending) return
      const { card, x, y } = pending
      const r = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${x - r.left}px`)
      card.style.setProperty('--my', `${y - r.top}px`)
      card.style.setProperty('--spot', '1')
    }

    const onMove = (e) => {
      const card = e.target.closest?.('.card')
      if (card !== active) {
        clear(active)
        active = card
      }
      if (!card) {
        pending = null
        return
      }
      pending = { card, x: e.clientX, y: e.clientY }
      if (!frame) frame = requestAnimationFrame(flush)
    }

    const onLeave = () => {
      clear(active)
      active = null
      pending = null
    }

    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      if (frame) cancelAnimationFrame(frame)
      clear(active)
    }
  }, [])
}

/**
 * Subtle magnetic pull toward the cursor. `quickTo` keeps this off the React
 * render path entirely — pointer events write straight to the transform.
 */
export function useMagnetic(strength = 0.28) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(pointer: coarse)').matches) return undefined

    const xTo = gsap.quickTo(el, 'x', { duration: 0.45, ease: EASE.out })
    const yTo = gsap.quickTo(el, 'y', { duration: 0.45, ease: EASE.out })

    const move = (e) => {
      const r = el.getBoundingClientRect()
      xTo((e.clientX - (r.left + r.width / 2)) * strength)
      yTo((e.clientY - (r.top + r.height / 2)) * strength)
    }
    const reset = () => {
      xTo(0)
      yTo(0)
    }

    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', reset)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', reset)
      gsap.killTweensOf(el)
    }
  }, [strength])

  return ref
}
