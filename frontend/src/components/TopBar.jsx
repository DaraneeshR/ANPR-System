import { useEffect, useState } from 'react'
import { useCountUp, useGsap } from '../anim/hooks'
import { DUR, EASE, gsap } from '../anim/motion'

const TITLES = {
  live: { title: 'Live recognition', crumb: 'Operations / Live' },
  logs: { title: 'Access logs', crumb: 'Operations / Logs' },
  registry: { title: 'Vehicle registry', crumb: 'Operations / Registry' },
}

const STATS = [
  ['total', 'Today'],
  ['granted', 'Granted'],
  ['denied', 'Denied'],
  ['unknown', 'Unknown'],
]

function Stat({ kind, label, value }) {
  const shown = useCountUp(value)

  // Pop the tile whenever the underlying number actually moves. Scale only —
  // the tile's semantic colour is owned by CSS and stays put.
  const scope = useGsap(() => {
    if (value == null) return
    gsap.fromTo(
      '.v',
      { scale: 1.18, transformOrigin: 'left center' },
      { scale: 1, duration: DUR.lg, ease: EASE.pop },
    )
  }, [value])

  return (
    <div className={`stat ${kind}`} ref={scope}>
      <div className="k">{label}</div>
      <div className="v">{shown}</div>
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <span className="mono" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
      {now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}
    </span>
  )
}

export default function TopBar({ tab, stats }) {
  const meta = TITLES[tab] || TITLES.live

  const scope = useGsap(() => {
    gsap.from('.topbar-title', {
      y: -12,
      opacity: 0,
      duration: DUR.md,
      ease: EASE.out,
    })
    gsap.from('.stat', {
      y: -14,
      opacity: 0,
      duration: DUR.md,
      stagger: 0.06,
      ease: EASE.out,
      delay: 0.1,
    })
  }, [tab])

  return (
    <header className="topbar" ref={scope}>
      <div className="topbar-title">
        <div className="crumb">{meta.crumb}</div>
        <h1>{meta.title}</h1>
      </div>

      <div className="row" style={{ gap: 10, marginLeft: 22 }}>
        <i className="pulse" />
        <Clock />
      </div>

      <div className="statrail">
        {STATS.map(([key, label]) => (
          <Stat key={key} kind={key} label={label} value={stats?.[key] ?? 0} />
        ))}
      </div>
    </header>
  )
}
