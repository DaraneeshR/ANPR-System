import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useGsap } from '../anim/hooks'
import { DUR, EASE, gsap } from '../anim/motion'
import { IconBlocked, IconCar, IconGhost, IconPhone, IconScan, IconShield, IconUser } from './Icons'

const VERDICT = {
  granted: { label: 'ACCESS GRANTED', Icon: IconShield },
  denied: { label: 'ACCESS DENIED', Icon: IconBlocked },
  unknown: { label: 'UNREGISTERED', Icon: IconGhost },
  no_detection: { label: 'NO PLATE FOUND', Icon: IconScan },
}

const TINT = {
  granted: 'rgba(93,211,158,.20)',
  denied: 'rgba(240,82,110,.20)',
  unknown: 'rgba(188,231,132,.16)',
  no_detection: 'rgba(122,119,153,.16)',
}

/**
 * Full frame with the detector's box drawn over it. `bbox` arrives in original
 * image pixels, but the <img> is `object-fit: contain` inside a fixed-ratio
 * box — so the letterboxed rect has to be recomputed before the overlay can be
 * placed, and again whenever the panel resizes.
 */
function FrameViewer({ src, bbox, confidence }) {
  const wrapRef = useRef(null)
  const imgRef = useRef(null)
  const boxRef = useRef(null)
  const [rect, setRect] = useState(null)

  const measure = useCallback(() => {
    const wrap = wrapRef.current
    const img = imgRef.current
    if (!wrap || !img || !img.naturalWidth || !bbox) return

    const cw = wrap.clientWidth
    const ch = wrap.clientHeight
    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight)
    const offX = (cw - img.naturalWidth * scale) / 2
    const offY = (ch - img.naturalHeight * scale) / 2
    const [x1, y1, x2, y2] = bbox

    setRect({
      left: offX + x1 * scale,
      top: offY + y1 * scale,
      width: (x2 - x1) * scale,
      height: (y2 - y1) * scale,
    })
  }, [bbox])

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [measure])

  // The box snaps into place from a slightly larger "acquiring" state, which
  // reads as the tracker locking on.
  useLayoutEffect(() => {
    if (!rect || !boxRef.current) return undefined
    const tween = gsap.fromTo(
      boxRef.current,
      { scale: 1.5, opacity: 0 },
      { scale: 1, opacity: 1, duration: DUR.md, ease: EASE.pop, delay: 0.24 },
    )
    return () => tween.revert()
  }, [rect])

  return (
    <div className="viewer" ref={wrapRef}>
      <img ref={imgRef} src={src} alt="processed frame" onLoad={measure} />

      <div className="scanline js-scanline" />

      {rect && (
        <div className="bbox" ref={boxRef} style={rect}>
          {confidence != null && (
            <span className="bbox-tag">PLATE {Math.round(confidence * 100)}%</span>
          )}
        </div>
      )}
    </div>
  )
}

function Plate({ text }) {
  const chars = (text || '—').split('')
  return (
    <div className="plate" aria-label={text || 'no plate read'}>
      {chars.map((c, i) => (
        <span key={`${c}-${i}`} className={`ch js-ch ${text ? '' : 'blank'}`}>
          {c}
        </span>
      ))}
    </div>
  )
}

function Meter({ label, value }) {
  const pct = value == null ? 0 : Math.round(value * 100)
  return (
    <div className={`meter ${pct > 0 && pct < 55 ? 'warn' : ''}`}>
      <div className="meter-top">
        <span>{label}</span>
        <b>{value == null ? '—' : `${pct}%`}</b>
      </div>
      <div className="track">
        <i className="fill js-fill" data-pct={pct} />
      </div>
    </div>
  )
}

function initials(name) {
  if (!name) return '—'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export default function ResultCard({ result }) {
  const scope = useGsap(() => {
    if (!result) return

    const tl = gsap.timeline({ defaults: { ease: EASE.out } })

    tl.from('.viewer', { scale: 0.96, opacity: 0, duration: DUR.md })
      // Sweep once on arrival — the "frame was just scanned" beat.
      .fromTo(
        '.js-scanline',
        { top: '-34%' },
        { top: '100%', duration: 0.85, ease: 'power1.inOut' },
        0.1,
      )
      .to('.js-scanline', { opacity: 0, duration: DUR.sm }, '>-0.15')
      .from('.eyebrow', { opacity: 0, x: -10, duration: DUR.sm }, 0.15)
      .from(
        '.js-ch',
        {
          y: 26,
          opacity: 0,
          rotateX: -75,
          duration: DUR.md,
          stagger: 0.035,
          ease: EASE.pop,
        },
        0.22,
      )
      .from(
        '.verdict',
        { scale: 0.8, opacity: 0, duration: 0.55, ease: EASE.pop },
        '-=0.15',
      )
      // Meters fill to the width encoded on each element.
      .to(
        '.js-fill',
        {
          width: (i, el) => `${el.dataset.pct}%`,
          duration: 0.9,
          stagger: 0.1,
          ease: EASE.expo,
        },
        '-=0.3',
      )
      .from('.owner', { y: 14, opacity: 0, duration: DUR.md }, '-=0.55')

    return () => tl.kill()
  }, [result?.key, result?.log_id])

  if (!result) {
    return (
      <div className="card result-empty">
        <div className="ring">
          <IconScan />
        </div>
        <div>
          <div style={{ color: 'var(--muted)', fontWeight: 600 }}>
            Awaiting a frame
          </div>
          <div style={{ fontSize: 12.5, marginTop: 3 }}>
            Start the feed or upload an image to run the pipeline.
          </div>
        </div>
      </div>
    )
  }

  const decision = result.decision || 'unknown'
  const verdict = VERDICT[decision] || VERDICT.unknown
  const { Icon } = verdict
  const vehicle = result.vehicle

  return (
    <div
      className="card result"
      ref={scope}
      style={{ '--tint': TINT[decision] || 'transparent' }}
    >
      <div>
        {result.frame_url ? (
          <FrameViewer
            src={result.frame_url}
            bbox={result.bbox}
            confidence={result.det_confidence}
          />
        ) : (
          <div className="viewer">
            {result.crop_url ? (
              <img src={result.crop_url} alt="detected plate" />
            ) : null}
            <div className="scanline js-scanline" />
          </div>
        )}

        {result.crop_url && result.frame_url && (
          <div className="viewer-strip">
            <img className="crop-strip" src={result.crop_url} alt="plate crop" />
          </div>
        )}
      </div>

      <div className="readout">
        <div className="eyebrow">Plate read</div>
        <Plate text={result.plate} />

        <span className={`verdict ${decision}`}>
          <Icon />
          {verdict.label}
        </span>

        <div className="meters">
          <Meter label="Detection confidence" value={result.det_confidence} />
          <Meter label="OCR confidence" value={result.ocr_confidence} />
        </div>

        <div className={`owner ${vehicle ? '' : 'absent'}`}>
          <div className="avatar">
            {vehicle ? initials(vehicle.owner_name) : <IconGhost width={18} height={18} />}
          </div>
          <div className="owner-meta">
            {vehicle ? (
              <>
                <div className="name">{vehicle.owner_name || 'Unnamed owner'}</div>
                <div className="line">
                  <span>
                    <IconCar width={13} height={13} />
                    {vehicle.vehicle_type || 'unspecified'}
                  </span>
                  {vehicle.phone && (
                    <span>
                      <IconPhone width={13} height={13} />
                      {vehicle.phone}
                    </span>
                  )}
                  {result.log_id != null && (
                    <span className="dim">log #{result.log_id}</span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="name" style={{ color: 'var(--muted)' }}>
                  {decision === 'no_detection'
                    ? 'No plate in this frame'
                    : 'Not in the vehicle registry'}
                </div>
                <div className="line">
                  <span>
                    <IconUser width={13} height={13} />
                    No owner on file
                  </span>
                  {result.log_id != null && (
                    <span className="dim">log #{result.log_id}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
