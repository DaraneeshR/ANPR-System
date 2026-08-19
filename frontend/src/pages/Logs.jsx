import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useGsap, useMarker } from '../anim/hooks'
import { DUR, EASE, gsap } from '../anim/motion'
import Badge from '../components/Badge.jsx'
import { Lightbox } from '../components/Overlay.jsx'
import { IconCheck, IconLogs, IconRefresh, IconSearch } from '../components/Icons'

const FILTERS = [
  ['', 'All'],
  ['granted', 'Granted'],
  ['denied', 'Denied'],
  ['unknown', 'Unknown'],
]

function timeOf(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function Conf({ value }) {
  const pct = value == null ? null : Math.round(value * 100)
  return (
    <div className="conf-cell">
      <span className="mini">
        <i style={{ width: `${pct ?? 0}%` }} />
      </span>
      <span className={pct == null ? 'dim' : ''}>{pct == null ? '—' : `${pct}%`}</span>
    </div>
  )
}

function CorrectCell({ log, onCorrected, onError }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const cellRef = useRef(null)

  const save = async () => {
    const next = value.trim()
    if (!next || saving) return
    setSaving(true)
    try {
      const updated = await api.correctLog(log.id, next)
      onCorrected(updated)
      setValue('')
      // Green flash on the row confirms the write landed.
      gsap.fromTo(
        cellRef.current.closest('tr'),
        { backgroundColor: 'rgba(93,211,158,.18)' },
        { backgroundColor: 'rgba(93,211,158,0)', duration: 1.1, ease: EASE.out },
      )
    } catch (e) {
      onError?.(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }} ref={cellRef}>
      <input
        type="text"
        className="mono plate-input"
        placeholder={log.corrected_plate || 'correct…'}
        value={value}
        style={{ width: 132, fontSize: 12 }}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        aria-label={`Correct plate for log ${log.id}`}
      />
      <button
        className="btn sm"
        onClick={save}
        disabled={saving || !value.trim()}
        aria-label="Save correction"
      >
        {saving ? '…' : <IconCheck />}
      </button>
    </div>
  )
}

export default function Logs({ onError }) {
  const [logs, setLogs] = useState([])
  const [decision, setDecision] = useState('')
  const [plate, setPlate] = useState('')
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(null)

  const { listRef, markerRef } = useMarker(decision, { axis: 'x' })
  const bodyRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.logs({ limit: 100, decision, plate })
      setLogs(data.logs || [])
    } catch (e) {
      onError?.(e.message)
    } finally {
      setLoading(false)
    }
  }, [decision, plate, onError])

  useEffect(() => {
    const t = setTimeout(load, 200) // debounce the plate search box
    return () => clearTimeout(t)
  }, [load])

  // Rows re-stagger whenever the result set changes, so a filter change reads
  // as new data rather than a silent swap.
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (loading || !body || body.children.length === 0) return undefined
    const tween = gsap.from(body.children, {
      y: 12,
      opacity: 0,
      duration: DUR.sm,
      stagger: 0.022,
      ease: EASE.out,
      overwrite: true,
    })
    return () => tween.revert()
  }, [logs, loading])

  const scope = useGsap(() => {
    gsap.from('.js-rise', {
      y: 20,
      opacity: 0,
      duration: DUR.md,
      stagger: 0.08,
      ease: EASE.out,
    })
  }, [])

  const onCorrected = (updated) =>
    setLogs((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))

  return (
    <div ref={scope}>
      <div className="page-head js-rise">
        <p className="sub">
          Newest first · correct a misread plate inline — the original stays on
          the row as retraining signal
        </p>
      </div>

      <div className="toolbar js-rise">
        <div className="segment" ref={listRef}>
          <span className="seg-marker" ref={markerRef} />
          {FILTERS.map(([key, label]) => (
            <button
              key={key || 'all'}
              data-key={key}
              className={`${key} ${decision === key ? 'on' : ''}`}
              onClick={() => setDecision(key)}
            >
              {key && <i className="dot" />}
              {label}
            </button>
          ))}
        </div>

        <div className="search">
          <IconSearch />
          <input
            type="search"
            placeholder="Search plate…"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            className="mono"
            style={{ width: 200 }}
          />
        </div>

        <button className="btn ghost" onClick={load}>
          <IconRefresh />
          Refresh
        </button>

        <div className="spacer" />

        <span className="sub" style={{ fontSize: 12.5 }}>
          {loading ? 'loading…' : <><b>{logs.length}</b> rows</>}
        </span>
      </div>

      <div className="card flush js-rise scroll-x">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Crop</th>
              <th>Plate</th>
              <th>Decision</th>
              <th>Detection</th>
              <th>OCR</th>
              <th>Owner</th>
              <th>Correction</th>
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="nowrap dim mono" style={{ fontSize: 12 }}>
                  {timeOf(log.created_at)}
                </td>
                <td>
                  {log.crop_url ? (
                    <img
                      className="thumb"
                      src={log.crop_url}
                      alt={log.plate_number || 'plate crop'}
                      onClick={() => setZoom(log.crop_url)}
                    />
                  ) : (
                    <span className="dim">—</span>
                  )}
                </td>
                <td className="nowrap">
                  <span className="plate-tag">{log.plate_number || '—'}</span>
                  {log.corrected_plate && (
                    <div className="corrected">
                      <IconCheck width={11} height={11} />
                      {log.corrected_plate}
                    </div>
                  )}
                </td>
                <td>
                  <Badge decision={log.decision} />
                </td>
                <td>
                  <Conf value={log.det_confidence} />
                </td>
                <td>
                  <Conf value={log.ocr_confidence} />
                </td>
                <td className="nowrap">
                  {log.owner_name || <span className="dim">—</span>}
                </td>
                <td>
                  <CorrectCell
                    log={log}
                    onCorrected={onCorrected}
                    onError={onError}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && logs.length === 0 && (
          <div style={{ padding: 18, display: 'grid', gap: 12 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div className="skel" key={i} style={{ opacity: 1 - i * 0.15 }} />
            ))}
          </div>
        )}

        {!loading && logs.length === 0 && (
          <div className="empty">
            <div className="ring">
              <IconLogs />
            </div>
            No logs match this filter.
          </div>
        )}
      </div>

      {zoom && <Lightbox src={zoom} alt="plate crop" onClose={() => setZoom(null)} />}
    </div>
  )
}
