import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useGsap, useMagnetic } from '../anim/hooks'
import { DUR, EASE, gsap } from '../anim/motion'
import Badge from '../components/Badge.jsx'
import ResultCard from '../components/ResultCard.jsx'
import { IconPlay, IconScan, IconStop, IconUpload } from '../components/Icons'

const INTERVAL_MS = 2000

function FeedRow({ item, isNewest }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    // Only the row that just arrived animates; the rest are simply pushed
    // down by layout, which keeps a long session cheap.
    if (!isNewest || !ref.current) return undefined
    const tween = gsap.from(ref.current, {
      y: -14,
      opacity: 0,
      scale: 0.97,
      duration: DUR.md,
      ease: EASE.out,
    })
    // revert(), not kill() — killing a `from` mid-flight would leave the row
    // stuck at its start values (opacity 0) under StrictMode's double-invoke.
    return () => tween.revert()
  }, [isNewest])

  return (
    <div className="feed-item" ref={ref}>
      {item.crop_url ? (
        <img src={item.crop_url} alt="" />
      ) : (
        <div className="no-img" />
      )}
      <span className="fplate">{item.plate || '—'}</span>
      <Badge decision={item.decision} />
      <span className="mono dim" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
        {item.det_confidence != null ? item.det_confidence.toFixed(2) : '—'}
        {' / '}
        {item.ocr_confidence != null ? item.ocr_confidence.toFixed(2) : '—'}
      </span>
    </div>
  )
}

export default function Live({ onProcessed, onError, running, setRunning }) {
  const [frames, setFrames] = useState([])
  const [curatedCount, setCuratedCount] = useState(0)
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)

  const timerRef = useRef(null)
  const cursorRef = useRef(0)
  const inFlightRef = useRef(false)
  const progressRef = useRef(null)
  const magnetRef = useMagnetic(0.22)

  useEffect(() => {
    api
      .demoFrames()
      .then((d) => {
        setFrames(d.frames || [])
        setCuratedCount(d.curated_count || 0)
      })
      .catch((e) => onError?.(`Could not load demo frames: ${e.message}`))
  }, [onError])

  const record = useCallback(
    (result, source) => {
      setResults((prev) => [
        { ...result, source, key: crypto.randomUUID() },
        ...prev.slice(0, 49),
      ])
      onProcessed?.()
    },
    [onProcessed],
  )

  // Kept in a ref so the interval always calls the latest version without
  // being torn down and restarted every render.
  const tickRef = useRef(null)
  tickRef.current = async () => {
    if (inFlightRef.current || frames.length === 0) return
    inFlightRef.current = true
    const filename = frames[cursorRef.current % frames.length]
    cursorRef.current += 1
    try {
      const result = await api.processDemoFrame(filename)
      record(result, filename)
    } catch (e) {
      onError?.(`Frame failed: ${e.message}`)
    } finally {
      inFlightRef.current = false
    }
  }

  // The bar under the toolbar tracks the interval, so the next capture is
  // visibly coming rather than arriving out of nowhere.
  useEffect(() => {
    const bar = progressRef.current
    if (!bar) return undefined
    if (!running) {
      gsap.to(bar, { width: 0, duration: DUR.sm })
      return undefined
    }
    const tween = gsap.fromTo(
      bar,
      { width: '0%' },
      {
        width: '100%',
        duration: INTERVAL_MS / 1000,
        ease: 'none',
        repeat: -1,
      },
    )
    return () => tween.kill()
  }, [running])

  const startFeed = () => {
    if (timerRef.current || frames.length === 0) return
    setRunning(true)
    tickRef.current()
    timerRef.current = setInterval(() => tickRef.current(), INTERVAL_MS)
  }

  const stopFeed = useCallback(() => {
    clearInterval(timerRef.current)
    timerRef.current = null
    setRunning(false)
  }, [setRunning])

  // Leaving the tab tears the interval down, so the shared "streaming" flag has
  // to come down with it or the sidebar keeps claiming a dead feed is live.
  useEffect(
    () => () => {
      clearInterval(timerRef.current)
      timerRef.current = null
      setRunning(false)
    },
    [setRunning],
  )

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const result = await api.processUpload(file)
      record(result, file.name)
    } catch (e) {
      onError?.(`Upload failed: ${e.message}`)
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  const scope = useGsap(() => {
    gsap.from('.js-rise', {
      y: 20,
      opacity: 0,
      duration: DUR.md,
      stagger: 0.08,
      ease: EASE.out,
    })
  }, [])

  const [latest, ...history] = results

  return (
    <div ref={scope}>
      <div className="page-head js-rise">
        <p className="sub">
          <b>{frames.length}</b> demo frames loaded · one capture every{' '}
          {INTERVAL_MS / 1000}s
          {curatedCount > 0 && (
            <>
              {' '}
              · the first <b>{curatedCount}</b> are vehicle photos; the rest are
              signage from the held-out set and read as unknown
            </>
          )}
        </p>
      </div>

      <div className="js-rise" style={{ marginBottom: 18 }}>
        <div className="toolbar" style={{ marginBottom: 0, position: 'relative' }}>
          {running ? (
            <button className="btn danger" onClick={stopFeed}>
              <IconStop />
              Stop feed
            </button>
          ) : (
            <button
              ref={magnetRef}
              className="btn primary"
              onClick={startFeed}
              disabled={frames.length === 0}
            >
              <IconPlay />
              Start feed
            </button>
          )}

          <label className={`btn ${busy ? '' : 'ghost'}`} style={{ cursor: 'pointer' }}>
            <IconUpload />
            {busy ? 'Processing…' : 'Upload image'}
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              disabled={busy}
              style={{ display: 'none' }}
            />
          </label>

          <div className="spacer" />

          <span className="row" style={{ gap: 8 }}>
            <i className={`pulse ${running ? '' : 'idle'}`} />
            <span className="sub" style={{ fontSize: 12.5 }}>
              {running ? 'Streaming' : 'Idle'} · <b>{results.length}</b> processed
              this session
            </span>
          </span>

          <div
            className="progress"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: '0 0 var(--r-lg) var(--r-lg)',
            }}
          >
            <i ref={progressRef} />
          </div>
        </div>
      </div>

      <div className="live-grid js-rise">
        <ResultCard result={latest} />

        <div className="card flush">
          <div className="card-head">
            <IconScan style={{ width: 15, height: 15, color: 'var(--faint)' }} />
            <h3>Session feed</h3>
            <span className="spacer" />
            <span className="mono dim" style={{ fontSize: 11 }}>
              {history.length}
            </span>
          </div>

          {history.length === 0 ? (
            <div className="feed-empty">
              Processed frames stack up here as the feed runs.
            </div>
          ) : (
            <div className="feed">
              {history.map((item, i) => (
                <FeedRow key={item.key} item={item} isNewest={i === 0} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
