import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from './api'
import { useCardSpotlight } from './anim/hooks'
import { DUR, EASE, gsap } from './anim/motion'
import Backdrop from './components/Backdrop.jsx'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import { ToastProvider, useToast } from './components/Toasts.jsx'
import Live from './pages/Live.jsx'
import Logs from './pages/Logs.jsx'
import Registry from './pages/Registry.jsx'

function Dashboard() {
  const toast = useToast()
  const [tab, setTab] = useState('live')
  const [stats, setStats] = useState(null)
  const [feedRunning, setFeedRunning] = useState(false)
  const [vehicleCount, setVehicleCount] = useState(0)
  const pageRef = useRef(null)

  useCardSpotlight()

  const refreshStats = useCallback(() => {
    api.stats().then(setStats).catch(() => {})
  }, [])

  useEffect(() => {
    refreshStats()
  }, [refreshStats, tab])

  useEffect(() => {
    api
      .vehicles()
      .then((d) => setVehicleCount((d.vehicles || []).length))
      .catch(() => {})
  }, [])

  // Each page owns its own entrance stagger; this is the cross-fade that ties
  // the swap together so tabs don't hard-cut.
  useLayoutEffect(() => {
    const el = pageRef.current
    if (!el) return undefined
    const tween = gsap.fromTo(
      el,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: DUR.md, ease: EASE.out },
    )
    return () => tween.revert()
  }, [tab])

  const onError = toast.error
  const onNotify = toast.success

  return (
    <>
      <Backdrop />

      <div className="shell">
        <Sidebar
          tab={tab}
          onTab={setTab}
          feedRunning={feedRunning}
          vehicleCount={vehicleCount}
        />

        <div className="main">
          <TopBar tab={tab} stats={stats} />

          <main className="page" ref={pageRef} key={tab}>
            {tab === 'live' && (
              <Live
                onProcessed={refreshStats}
                onError={onError}
                running={feedRunning}
                setRunning={setFeedRunning}
              />
            )}
            {tab === 'logs' && <Logs onError={onError} />}
            {tab === 'registry' && (
              <Registry
                onError={onError}
                onNotify={onNotify}
                onCountChange={setVehicleCount}
              />
            )}
          </main>
        </div>
      </div>
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  )
}
