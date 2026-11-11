/**
 * Satu set ikon garis (stroke 1.75, viewBox 24) untuk seluruh aplikasi.
 * inspired Phosphor/Lucide — dipakai konsisten di sidebar, tombol, dan tabel.
 * Emoji TIDAK boleh dipakai sebagai ikon.
 */

interface IconProps {
  className?: string
  size?: number
}

function base(className?: string, size = 16): Record<string, unknown> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
  }
}

/* ---------- Navigasi (sidebar) ---------- */

export const IconDashboard = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

export const IconApps = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <rect x="3" y="4" width="18" height="6" rx="1.5" />
    <rect x="3" y="14" width="18" height="6" rx="1.5" />
    <path d="M7 7h.01M7 17h.01" />
  </svg>
)

export const IconCamera = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H7l1.5-2h7L17 7h2.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
    <circle cx="12" cy="13" r="3.25" />
  </svg>
)

export const IconImages = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m3 16 4.5-4.5 3 3L14 11l7 7" />
  </svg>
)

export const IconWand = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="M4 20 16 8" />
    <path d="m14 6 4 4" />
    <path d="M17 3v3M20.5 6h-3M8.5 3v2M10.5 4.5h-2M18 14v2.5M19.5 16h-2" />
  </svg>
)

export const IconLayers = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
)

export const IconFlow = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <rect x="3" y="3" width="6" height="5" rx="1" />
    <rect x="15" y="16" width="6" height="5" rx="1" />
    <path d="M6 8v5.5A2.5 2.5 0 0 0 8.5 16H15" />
  </svg>
)

export const IconBook = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
    <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5Z" />
  </svg>
)

export const IconDoc = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="M6 3h7l5 5v13H6V3Z" />
    <path d="M13 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </svg>
)

export const IconGlobe = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.5 2.7 3.8 5.8 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.8-3.8-9S9.5 5.7 12 3Z" />
  </svg>
)

export const IconChart = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 16v-4M12 16V8M16 16v-6" />
  </svg>
)

export const IconUsers = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <circle cx="9" cy="8" r="3.25" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.2a3.25 3.25 0 0 1 0 5.6M17.5 14.6a5.5 5.5 0 0 1 3 4.9" />
  </svg>
)

export const IconSettings = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </svg>
)

/* ---------- Aksi ---------- */

export const IconPlus = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconSearch = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
)

export const IconCheck = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
)

export const IconX = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const IconWarning = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="M12 4.5 21 20H3l9-15.5Z" />
    <path d="M12 10v4M12 17h.01" />
  </svg>
)

export const IconInfo = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
)

export const IconLock = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <rect x="4" y="10" width="16" height="10" rx="1.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
)

export const IconLogout = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 8 6 12l4 4M6 12h9" />
  </svg>
)

export const IconMenu = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)

export const IconArrowLeft = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
)

export const IconExternal = ({ className, size }: IconProps) => (
  <svg {...base(className, size)}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
)
