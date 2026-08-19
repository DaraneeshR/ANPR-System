import { useGsap, useMarker } from '../anim/hooks'
import { DUR, EASE, gsap } from '../anim/motion'
import { IconLive, IconLogs, IconRegistry, IconScan } from './Icons'

export const TABS = [
  { key: 'live', label: 'Live feed', Icon: IconLive },
  { key: 'logs', label: 'Access logs', Icon: IconLogs },
  { key: 'registry', label: 'Registry', Icon: IconRegistry },
]

export default function Sidebar({ tab, onTab, feedRunning, vehicleCount }) {
  const { listRef, markerRef } = useMarker(tab, { axis: 'y' })

  const scope = useGsap(() => {
    const tl = gsap.timeline()
    tl.from('.brand', { x: -20, opacity: 0, duration: DUR.md, ease: EASE.out })
      .from(
        '.nav-item',
        { x: -18, opacity: 0, duration: DUR.md, stagger: 0.07, ease: EASE.out },
        '-=0.28',
      )
      .from('.rail-foot', { opacity: 0, y: 14, duration: DUR.md }, '-=0.2')
    return () => tl.kill()
  }, [])

  return (
    <aside className="rail" ref={scope}>
      <div className="brand">
        <div className="brand-mark">
          <IconScan style={{ color: 'var(--ink)' }} />
        </div>
        <div className="brand-text">
          <div className="brand-name">ANPR</div>
          <div className="brand-sub">Access Control</div>
        </div>
      </div>

      <div className="rail-label">Operations</div>

      <nav className="rail-nav" ref={listRef}>
        <span className="nav-marker" ref={markerRef} />
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            data-key={key}
            className={`nav-item ${tab === key ? 'active' : ''}`}
            onClick={() => onTab(key)}
            aria-current={tab === key ? 'page' : undefined}
          >
            <Icon />
            <span>{label}</span>
            {key === 'registry' && vehicleCount > 0 && (
              <span className="nav-count">{vehicleCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="rail-foot">
        <div className="kv">
          <span>Pipeline</span>
          <b>YOLO11n · ONNX</b>
        </div>
        <div className="kv">
          <span>Recognition</span>
          <b>EasyOCR</b>
        </div>
        <div className="kv">
          <span>Feed</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              color: feedRunning ? 'var(--granted)' : 'var(--faint)',
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            <i className={`pulse ${feedRunning ? '' : 'idle'}`} />
            {feedRunning ? 'Streaming' : 'Idle'}
          </span>
        </div>
      </div>
    </aside>
  )
}
