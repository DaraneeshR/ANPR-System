// All requests go through the Vite dev proxy, so paths are origin-relative.

async function req(path, options = {}) {
  const res = await fetch(path, options)
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body.detail) detail = body.detail
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail)
  }
  return res.status === 204 ? null : res.json()
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  demoFrames: () => req('/api/anpr/demo-frames'),

  processDemoFrame: (filename) =>
    req('/api/anpr/demo-frame', json('POST', { filename })),

  processUpload: (file) => {
    const data = new FormData()
    data.append('file', file)
    return req('/api/anpr/process', { method: 'POST', body: data })
  },

  logs: ({ limit = 50, decision = '', plate = '' } = {}) => {
    const params = new URLSearchParams({ limit })
    if (decision) params.set('decision', decision)
    if (plate) params.set('plate', plate)
    return req(`/api/logs?${params}`)
  },

  correctLog: (id, correctedPlate) =>
    req(`/api/logs/${id}/correct`, json('PATCH', { corrected_plate: correctedPlate })),

  vehicles: () => req('/api/vehicles'),
  createVehicle: (payload) => req('/api/vehicles', json('POST', payload)),
  updateVehicle: (id, payload) => req(`/api/vehicles/${id}`, json('PATCH', payload)),
  deleteVehicle: (id) => req(`/api/vehicles/${id}`, { method: 'DELETE' }),

  stats: () => req('/api/stats'),
}
