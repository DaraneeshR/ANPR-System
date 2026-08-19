import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { DUR, EASE, gsap } from '../anim/motion'
import { IconAlert, IconCheck, IconInfo } from './Icons'

const ToastContext = createContext(() => {})

/** `const toast = useToast(); toast.error('…')` */
export function useToast() {
  return useContext(ToastContext)
}

const ICONS = {
  error: IconAlert,
  success: IconCheck,
  info: IconInfo,
}

const LIFETIME = 4600

function Toast({ toast, onDismiss }) {
  const ref = useRef(null)
  const Icon = ICONS[toast.kind] || IconInfo

  useLayoutEffect(() => {
    const el = ref.current
    const tl = gsap.timeline()
    tl.fromTo(
      el,
      { x: 40, opacity: 0, scale: 0.94 },
      { x: 0, opacity: 1, scale: 1, duration: DUR.md, ease: EASE.pop },
    )

    // The exit tween owns the removal, so the node is never yanked mid-flight.
    const timer = setTimeout(() => {
      gsap.to(el, {
        x: 40,
        opacity: 0,
        scale: 0.96,
        duration: DUR.sm,
        ease: EASE.in,
        onComplete: () => onDismiss(toast.id),
      })
    }, LIFETIME)

    return () => {
      clearTimeout(timer)
      tl.revert()
    }
  }, [toast.id, onDismiss])

  return (
    <div className={`toast ${toast.kind}`} ref={ref} role="status">
      <Icon className="ico" />
      <div>{toast.message}</div>
      <button
        className="close"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((kind, message) => {
    if (!message) return
    setToasts((prev) => [
      // Cap the stack so a failing feed can't paper over the UI.
      ...prev.slice(-3),
      { id: crypto.randomUUID(), kind, message: String(message) },
    ])
  }, [])

  const api = useRef(null)
  if (!api.current) {
    api.current = {
      error: (m) => push('error', m),
      success: (m) => push('success', m),
      info: (m) => push('info', m),
    }
  }

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
