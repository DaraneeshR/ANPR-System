/* Inline stroke icons — no icon package, no network request, themeable via
   `currentColor`. Every icon shares the same 24px grid and 2px stroke. */

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export const IconLive = (p) => (
  <svg {...base} {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h3l1.5-2h5L16 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="12" r="3.5" />
  </svg>
)

export const IconLogs = (p) => (
  <svg {...base} {...p}>
    <path d="M4 5h16M4 12h16M4 19h10" />
    <circle cx="19.5" cy="19" r="2" />
  </svg>
)

export const IconRegistry = (p) => (
  <svg {...base} {...p}>
    <path d="M5 17h14l-1.6-5.2A2 2 0 0 0 15.5 10h-7a2 2 0 0 0-1.9 1.4z" />
    <path d="M5 17v2.5M19 17v2.5M7.5 13.5h9" />
    <circle cx="7.5" cy="17" r="0.6" fill="currentColor" />
    <circle cx="16.5" cy="17" r="0.6" fill="currentColor" />
  </svg>
)

export const IconPlay = (p) => (
  <svg {...base} {...p}>
    <path d="M7 4.8v14.4l12-7.2z" fill="currentColor" stroke="none" />
  </svg>
)

export const IconStop = (p) => (
  <svg {...base} {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </svg>
)

export const IconUpload = (p) => (
  <svg {...base} {...p}>
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
)

export const IconSearch = (p) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.6-3.6" />
  </svg>
)

export const IconRefresh = (p) => (
  <svg {...base} {...p}>
    <path d="M20 11a8 8 0 1 0-1.9 6.3" />
    <path d="M20 20v-5h-5" />
  </svg>
)

export const IconCheck = (p) => (
  <svg {...base} {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
)

export const IconShield = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3 5 6v5.5c0 4.3 2.9 7.7 7 9.5 4.1-1.8 7-5.2 7-9.5V6z" />
    <path d="m9 12 2 2 4-4.5" />
  </svg>
)

export const IconBlocked = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m6.5 6.5 11 11" />
  </svg>
)

export const IconAlert = (p) => (
  <svg {...base} {...p}>
    <path d="M12 4.5 2.8 20h18.4z" />
    <path d="M12 10v4.2M12 17.3v.2" />
  </svg>
)

export const IconGhost = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" strokeDasharray="3 3.5" />
    <path d="M12 8v4.5M12 15.6v.2" />
  </svg>
)

export const IconEdit = (p) => (
  <svg {...base} {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
    <path d="m14.5 7.5 2 2" />
  </svg>
)

export const IconTrash = (p) => (
  <svg {...base} {...p}>
    <path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 12.5h9L17.5 7" />
  </svg>
)

export const IconPlus = (p) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconClose = (p) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const IconUser = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8.5" r="3.7" />
    <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
  </svg>
)

export const IconPhone = (p) => (
  <svg {...base} {...p}>
    <path d="M5 4h3.5l1.7 4.2-2.1 1.5a12 12 0 0 0 5.7 5.7l1.5-2.1L19.5 15V18a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 3.5 6.2 2 2 0 0 1 5 4z" />
  </svg>
)

export const IconCar = (p) => (
  <svg {...base} {...p}>
    <path d="M4.5 16.5h15l-1.4-5A2 2 0 0 0 16.2 10H7.8a2 2 0 0 0-1.9 1.5z" />
    <circle cx="7.8" cy="16.5" r="1.6" />
    <circle cx="16.2" cy="16.5" r="1.6" />
  </svg>
)

export const IconScan = (p) => (
  <svg {...base} {...p}>
    <path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5" />
    <path d="M4 12h16" />
  </svg>
)

export const IconInfo = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8.2v.2" />
  </svg>
)
