import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useGsap } from '../anim/hooks'
import { DUR, EASE, gsap } from '../anim/motion'
import { ConfirmDialog } from '../components/Overlay.jsx'
import {
  IconCheck,
  IconClose,
  IconEdit,
  IconPlus,
  IconRegistry,
  IconTrash,
} from '../components/Icons'

const BLANK = { plate_number: '', owner_name: '', phone: '', vehicle_type: 'car' }

function EditableRow({ vehicle, onSaved, onDeleted, onError, onNotify, isNew }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(vehicle)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const rowRef = useRef(null)

  useEffect(() => setDraft(vehicle), [vehicle])

  // A freshly added vehicle lands with a highlight so it's obvious where it
  // went in an already-long table.
  useLayoutEffect(() => {
    if (!isNew || !rowRef.current) return undefined
    const tl = gsap.timeline()
    tl.from(rowRef.current, {
      y: -12,
      opacity: 0,
      duration: DUR.md,
      ease: EASE.out,
    }).fromTo(
      rowRef.current,
      { backgroundColor: 'rgba(52,138,167,.22)' },
      { backgroundColor: 'rgba(52,138,167,0)', duration: 1.4, ease: EASE.out },
      0,
    )
    return () => tl.revert()
  }, [isNew])

  const patch = async (payload) => {
    setBusy(true)
    try {
      onSaved(await api.updateVehicle(vehicle.id, payload))
      setEditing(false)
    } catch (e) {
      onError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setConfirming(false)
    setBusy(true)
    try {
      // Fade the row out before dropping it from state, so the table doesn't
      // visibly jump.
      await new Promise((resolve) => {
        gsap.to(rowRef.current, {
          opacity: 0,
          x: 24,
          duration: DUR.sm,
          ease: EASE.in,
          onComplete: resolve,
        })
      })
      await api.deleteVehicle(vehicle.id)
      onDeleted(vehicle.id)
      onNotify?.(`${vehicle.plate_number} removed from the registry`)
    } catch (e) {
      gsap.to(rowRef.current, { opacity: 1, x: 0, duration: DUR.sm })
      onError(e.message)
      setBusy(false)
    }
  }

  const field = (key, width) => (
    <input
      type="text"
      value={draft[key] || ''}
      style={{ width }}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      aria-label={key.replace('_', ' ')}
    />
  )

  return (
    <>
      <tr ref={rowRef}>
        <td className="nowrap">
          <span className="plate-tag">{vehicle.plate_number}</span>
        </td>
        <td>
          {editing ? (
            field('owner_name', 150)
          ) : (
            vehicle.owner_name || <span className="dim">—</span>
          )}
        </td>
        <td className="nowrap">
          {editing ? field('phone', 130) : vehicle.phone || <span className="dim">—</span>}
        </td>
        <td className="nowrap">
          {editing ? (
            field('vehicle_type', 100)
          ) : (
            vehicle.vehicle_type || <span className="dim">—</span>
          )}
        </td>
        <td>
          <label className="switch">
            <input
              type="checkbox"
              checked={vehicle.is_authorized}
              disabled={busy}
              onChange={(e) => patch({ is_authorized: e.target.checked })}
            />
            <span className="track" />
            <span
              className={`badge ${vehicle.is_authorized ? 'granted' : 'denied'}`}
            >
              <i className="dot" />
              {vehicle.is_authorized ? 'Allowed' : 'Blocked'}
            </span>
          </label>
        </td>
        <td>
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            {editing ? (
              <>
                <button
                  className="btn sm primary"
                  disabled={busy}
                  onClick={() =>
                    patch({
                      owner_name: draft.owner_name,
                      phone: draft.phone,
                      vehicle_type: draft.vehicle_type,
                    })
                  }
                >
                  <IconCheck />
                  Save
                </button>
                <button
                  className="btn sm ghost icon"
                  onClick={() => {
                    setDraft(vehicle)
                    setEditing(false)
                  }}
                  aria-label="Cancel"
                >
                  <IconClose />
                </button>
              </>
            ) : (
              <button className="btn sm ghost" onClick={() => setEditing(true)}>
                <IconEdit />
                Edit
              </button>
            )}
            <button
              className="btn sm danger icon"
              disabled={busy}
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${vehicle.plate_number}`}
            >
              <IconTrash />
            </button>
          </div>
        </td>
      </tr>

      {confirming && (
        <ConfirmDialog
          title="Delete vehicle"
          body={`${vehicle.plate_number} will be removed from the registry. Existing access logs keep the plate but lose the owner link.`}
          confirmLabel="Delete"
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}

export default function Registry({ onError, onNotify, onCountChange }) {
  const [vehicles, setVehicles] = useState([])
  const [form, setForm] = useState(BLANK)
  const [adding, setAdding] = useState(false)
  const [newId, setNewId] = useState(null)
  const [loading, setLoading] = useState(true)
  const plateInput = useRef(null)

  useEffect(() => {
    api
      .vehicles()
      .then((d) => {
        setVehicles(d.vehicles || [])
        onCountChange?.((d.vehicles || []).length)
      })
      .catch((e) => onError?.(e.message))
      .finally(() => setLoading(false))
  }, [onError, onCountChange])

  const add = async (event) => {
    event.preventDefault()
    if (!form.plate_number.trim()) return
    setAdding(true)
    try {
      const created = await api.createVehicle(form)
      setVehicles((prev) => {
        onCountChange?.(prev.length + 1)
        return [created, ...prev]
      })
      setNewId(created.id)
      setForm(BLANK)
      plateInput.current?.focus()
      onNotify?.(`${created.plate_number} added to the registry`)
    } catch (e) {
      onError?.(e.message)
    } finally {
      setAdding(false)
    }
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const scope = useGsap(() => {
    gsap.from('.js-rise', {
      y: 20,
      opacity: 0,
      duration: DUR.md,
      stagger: 0.08,
      ease: EASE.out,
    })
  }, [])

  const authorized = vehicles.filter((v) => v.is_authorized).length

  return (
    <div ref={scope}>
      <div className="page-head js-rise">
        <p className="sub">
          <b>{vehicles.length}</b> registered · <b>{authorized}</b> allowed ·{' '}
          <b>{vehicles.length - authorized}</b> blocked — toggle access to block a
          vehicle without deleting it
        </p>
      </div>

      <form className="card add-form js-rise" style={{ marginBottom: 18 }} onSubmit={add}>
        <div className="field">
          <label htmlFor="reg-plate">Plate number</label>
          <input
            id="reg-plate"
            ref={plateInput}
            type="text"
            className="mono plate-input"
            placeholder="MH14EU3498"
            value={form.plate_number}
            onChange={(e) =>
              setForm({ ...form, plate_number: e.target.value.toUpperCase() })
            }
            required
          />
        </div>
        <div className="field">
          <label htmlFor="reg-owner">Owner</label>
          <input
            id="reg-owner"
            type="text"
            placeholder="Full name"
            value={form.owner_name}
            onChange={set('owner_name')}
          />
        </div>
        <div className="field">
          <label htmlFor="reg-phone">Phone</label>
          <input
            id="reg-phone"
            type="tel"
            placeholder="Optional"
            value={form.phone}
            onChange={set('phone')}
          />
        </div>
        <div className="field">
          <label htmlFor="reg-type">Type</label>
          <input
            id="reg-type"
            type="text"
            placeholder="car"
            value={form.vehicle_type}
            onChange={set('vehicle_type')}
          />
        </div>
        <button className="btn primary" type="submit" disabled={adding}>
          <IconPlus />
          {adding ? 'Adding…' : 'Add vehicle'}
        </button>
      </form>

      <div className="card flush js-rise scroll-x">
        <table>
          <thead>
            <tr>
              <th>Plate</th>
              <th>Owner</th>
              <th>Phone</th>
              <th>Type</th>
              <th>Access</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <EditableRow
                key={v.id}
                vehicle={v}
                isNew={v.id === newId}
                onSaved={(updated) =>
                  setVehicles((prev) =>
                    prev.map((x) => (x.id === updated.id ? updated : x)),
                  )
                }
                onDeleted={(id) =>
                  setVehicles((prev) => {
                    const next = prev.filter((x) => x.id !== id)
                    onCountChange?.(next.length)
                    return next
                  })
                }
                onError={onError}
                onNotify={onNotify}
              />
            ))}
          </tbody>
        </table>

        {loading && vehicles.length === 0 && (
          <div style={{ padding: 18, display: 'grid', gap: 12 }}>
            {Array.from({ length: 4 }, (_, i) => (
              <div className="skel" key={i} style={{ opacity: 1 - i * 0.18 }} />
            ))}
          </div>
        )}

        {!loading && vehicles.length === 0 && (
          <div className="empty">
            <div className="ring">
              <IconRegistry />
            </div>
            No vehicles yet — add one above.
          </div>
        )}
      </div>
    </div>
  )
}
