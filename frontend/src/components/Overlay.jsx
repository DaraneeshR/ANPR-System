import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { DUR, EASE, gsap } from '../anim/motion'

/**
 * Portalled modal surface. Handles the scrim + panel entrance, Escape, and
 * body scroll lock. `ConfirmDialog` and `Lightbox` both build on it.
 */
function Overlay({ onClose, children, className = '' }) {
  const scrim = useRef(null)
  const panel = useRef(null)

  useLayoutEffect(() => {
    const tl = gsap.timeline()
    tl.fromTo(scrim.current, { opacity: 0 }, { opacity: 1, duration: DUR.sm })
    tl.fromTo(
      panel.current,
      { y: 24, scale: 0.96, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: DUR.md, ease: EASE.pop },
      '-=0.16',
    )
    return () => tl.revert()
  }, [])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <div
      className={`overlay ${className}`}
      ref={scrim}
      onMouseDown={(e) => e.target === scrim.current && onClose()}
    >
      <div ref={panel}>{children}</div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }) {
  return (
    <Overlay onClose={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="actions">
          <button className="btn ghost" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button className="btn danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

export function Lightbox({ src, alt = '', onClose }) {
  return (
    <Overlay onClose={onClose} className="lightbox">
      <img src={src} alt={alt} />
    </Overlay>
  )
}

export default Overlay
