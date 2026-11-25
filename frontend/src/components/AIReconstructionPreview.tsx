import { useMemo, useState } from 'react'
import type {
  Reconstruction,
  ReconstructionComponent,
} from '../lib/reconstruction'
import { Badge, EmptyState, cn } from './ui'
import { IconInfo, IconMagic, IconWarning } from './icons'

interface AIReconstructionPreviewProps {
  draft: Reconstruction | null
  className?: string
}

/** Menyiapkan string SVG agar valid dan aman untuk dirender via data URI <img> */
function prepareSvg(svg: string, colorOverride?: string): string {
  let s = svg.trim()
  if (!s.startsWith('<svg')) return ''

  // Pastikan xmlns terpasang agar browser dapat mem-parse XML di context <img>
  if (!s.includes('xmlns=')) {
    s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }

  // Ganti currentColor dengan warna yang sesuai karena <img> terisolasi dari cascade CSS
  const targetColor = colorOverride || '#6b7280'
  s = s.replace(/currentColor/g, targetColor)

  return s
}

/** Render SVG icon secara aman dari data URI tanpa raw dangerouslySetInnerHTML */
export function SafeIcon({
  svgString,
  className,
  color,
}: {
  svgString?: string
  className?: string
  color?: string
}) {
  if (!svgString) return null
  const prepared = prepareSvg(svgString, color)
  if (!prepared) return null
  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(prepared)}`
  return (
    <img
      src={dataUri}
      alt=""
      aria-hidden="true"
      className={cn('inline-block shrink-0 select-none', className)}
    />
  )
}

/** Mengambil hanya properti CSS aman dari metadata DOM */
const SAFE_STYLE_KEYS = new Set([
  'color',
  'backgroundColor',
  'borderColor',
  'borderRadius',
  'borderWidth',
  'borderStyle',
  'fontSize',
  'fontWeight',
  'fontFamily',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'boxShadow',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'gap',
])

function pickSafeStyles(styleObj?: Record<string, any> | null): React.CSSProperties {
  if (!styleObj || typeof styleObj !== 'object') return {}
  const safe: Record<string, any> = {}
  for (const [k, v] of Object.entries(styleObj)) {
    if (SAFE_STYLE_KEYS.has(k) && typeof v === 'string' && v.trim()) {
      safe[k] = v
    }
  }
  return safe
}

/** Membersihkan awalan label teknis untuk tampilan preview yang rapi */
function cleanLabel(label?: string | null): string {
  if (!label) return ''
  return label
    .replace(/^Field\s+/i, '')
    .replace(/^Tombol\s+/i, '')
    .replace(/^Judul\s+/i, '')
    .replace(/^Link\s+/i, '')
    .replace(/^Checkbox\s+/i, '')
    .replace(/^Kartu\s+/i, '')
    .trim()
}

/** Ekstrak icon SVG atau URL gambar dari komponen */
function getComponentIcon(comp: ReconstructionComponent): { svg?: string; imgSrc?: string; imgAlt?: string } {
  const props = comp.props || {}
  const dom = (props.dom as Record<string, any>) || {}

  if (typeof props.iconSvg === 'string' && props.iconSvg.trim().startsWith('<svg')) {
    return { svg: props.iconSvg }
  }
  if (typeof dom.iconSvg === 'string' && dom.iconSvg.trim().startsWith('<svg')) {
    return { svg: dom.iconSvg }
  }
  if (typeof dom.icon?.svg === 'string' && dom.icon.svg.trim().startsWith('<svg')) {
    return { svg: dom.icon.svg }
  }
  if (typeof dom.icon?.img?.src === 'string') {
    return { imgSrc: dom.icon.img.src, imgAlt: dom.icon.img.alt || comp.label || '' }
  }
  return {}
}

export function AIReconstructionPreview({ draft, className }: AIReconstructionPreviewProps) {
  // State untuk toggle password visibility di preview
  const [showPassword, setShowPassword] = useState(false)

  // Filter komponen aktif (mengecualikan tombstones)
  const activeComponents = useMemo(() => {
    if (!draft?.components) return []
    const tombstones = new Set((draft.layout?.tombstones ?? []).map((v) => String(v)))
    return draft.components.filter((comp) => {
      const rawId = String(comp.id)
      return !tombstones.has(rawId) && !tombstones.has(`auto_${rawId}`) && !tombstones.has(`manual_${rawId}`)
    })
  }, [draft])

  if (!draft || activeComponents.length === 0) {
    return (
      <div className="py-12">
        <EmptyState
          title="Belum ada draf"
          description="Klik Analisis & buat draf atau AI Vision terlebih dahulu."
        />
      </div>
    )
  }

  // Tentukan badge sumber data
  let sourceBadgeText = 'Sumber: rule-engine'
  let sourceBadgeTone: 'neutral' | 'success' | 'warning' | 'info' = 'neutral'
  let sourceIcon = <IconInfo size={11} className="mr-1" />

  if (draft.layout?.ai_status === 'success') {
    const model = draft.layout.ai_model || 'Gemini'
    sourceBadgeText = `Sumber: AI Vision (${model})`
    sourceBadgeTone = 'success'
    sourceIcon = <IconMagic size={11} className="mr-1" />
  } else if (draft.layout?.ai_status === 'failed') {
    sourceBadgeText = 'Sumber: rule-engine (AI Vision gagal)'
    sourceBadgeTone = 'warning'
    sourceIcon = <IconWarning size={11} className="mr-1" />
  } else if (draft.layout?.ai_source && draft.layout.ai_source !== 'rule-engine') {
    sourceBadgeText = `Sumber: ${draft.layout.ai_source}`
    sourceBadgeTone = 'info'
  } else if (activeComponents.some((c) => c.source === 'ai-vision')) {
    sourceBadgeText = 'Sumber: AI Vision'
    sourceBadgeTone = 'success'
    sourceIcon = <IconMagic size={11} className="mr-1" />
  }

  // Ekstrak tema visual
  const theme = draft.layout?.theme
  const pageBg = theme?.page?.backgroundColor || '#fafaf9'
  const pageFont = theme?.page?.fontFamily || 'inherit'
  const primaryStyle: React.CSSProperties = {
    backgroundColor: theme?.primary?.backgroundColor || '#4268ff',
    color: theme?.primary?.color || '#ffffff',
    borderRadius: theme?.primary?.borderRadius || '8px',
    fontWeight: theme?.primary?.fontWeight || '600',
  }
  const headingStyle: React.CSSProperties = {
    color: theme?.text?.heading?.color || '#111827',
    fontSize: theme?.text?.heading?.fontSize || '20px',
    fontWeight: theme?.text?.heading?.fontWeight || '700',
  }
  const bodyStyle: React.CSSProperties = {
    color: theme?.text?.body?.color || '#6b7280',
    fontSize: theme?.text?.body?.fontSize || '13px',
  }
  const cardStyle: React.CSSProperties = {
    backgroundColor: theme?.card?.backgroundColor || '#ffffff',
    borderColor: theme?.card?.borderColor || 'rgba(231, 229, 228, 0.8)',
    borderRadius: theme?.card?.borderRadius || '20px',
    boxShadow:
      theme?.card?.boxShadow ||
      '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
  }

  // Klasifikasikan region komponen
  const sidebarComponents = activeComponents.filter(
    (c) => c.region === 'sidebar' || c.component_type === 'nav-item',
  )
  const headerComponents = activeComponents.filter(
    (c) => c.region === 'header' || c.component_type === 'header-item',
  )
  const mainComponents = activeComponents.filter(
    (c) => !sidebarComponents.includes(c) && !headerComponents.includes(c),
  )

  // Cek apakah halaman bertipe Auth / Login
  const hasSidebar = Boolean(
    draft.layout?.has_sidebar || draft.layout?.regions?.sidebar || sidebarComponents.length > 0,
  )
  const hasHeader = Boolean(
    draft.layout?.has_header || draft.layout?.regions?.header || headerComponents.length > 0,
  )
  const isAuthPage =
    !hasSidebar &&
    (activeComponents.some(
      (c) =>
        c.component_type === 'password' ||
        (c.props?.input_type === 'password') ||
        (c.props?.dom as any)?.inputType === 'password' ||
        (c.label || '').toLowerCase().includes('password') ||
        (c.label || '').toLowerCase().includes('masuk'),
    ) ||
      Boolean(theme?.card))

  return (
    <div className={cn('flex flex-col space-y-3', className)}>
      {/* Sub-header info bar dengan Badge sumber data */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <Badge tone={sourceBadgeTone}>
            <span className="flex items-center">
              {sourceIcon}
              {sourceBadgeText}
            </span>
          </Badge>
          <span className="text-xs text-slate-500">
            {activeComponents.length} komponen draf
          </span>
        </div>
        <div className="text-[11px] text-slate-400 font-medium">
          {isAuthPage ? 'Layout: Halaman Auth / Login' : hasSidebar ? 'Layout: Dashboard & Sidebar' : 'Layout: Standar'}
        </div>
      </div>

      {/* Area visual UI preview yang dapat di-scroll dan tingginya sejajar */}
      <div className="overflow-auto max-h-[750px] min-h-[480px] rounded-lg border border-slate-200 bg-slate-100/60 p-3 sm:p-5">
        {isAuthPage ? (
          <AuthPreview
            components={mainComponents}
            pageBg={pageBg}
            pageFont={pageFont}
            headingStyle={headingStyle}
            bodyStyle={bodyStyle}
            cardStyle={cardStyle}
            primaryStyle={primaryStyle}
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword((prev) => !prev)}
          />
        ) : (
          <DashboardPreview
            hasSidebar={hasSidebar}
            hasHeader={hasHeader}
            sidebarComponents={sidebarComponents}
            headerComponents={headerComponents}
            mainComponents={mainComponents}
            pageBg={pageBg}
            pageFont={pageFont}
            headingStyle={headingStyle}
            bodyStyle={bodyStyle}
            cardStyle={cardStyle}
            primaryStyle={primaryStyle}
          />
        )}
      </div>
    </div>
  )
}

/* =========================================================================
 * 1. Auth / Login Preview Renderer
 * ========================================================================= */

interface AuthPreviewProps {
  components: ReconstructionComponent[]
  pageBg: string
  pageFont: string
  headingStyle: React.CSSProperties
  bodyStyle: React.CSSProperties
  cardStyle: React.CSSProperties
  primaryStyle: React.CSSProperties
  showPassword: boolean
  onTogglePassword: () => void
}

function AuthPreview({
  components,
  pageBg,
  pageFont,
  headingStyle,
  bodyStyle,
  cardStyle,
  primaryStyle,
  showPassword,
  onTogglePassword,
}: AuthPreviewProps) {
  // Ekstrak elemen-elemen spesifik auth
  const logo = components.find(
    (c) => c.component_type === 'logo' || (c.label || '').toLowerCase().includes('logo'),
  )
  const heading = components.find(
    (c) =>
      c.component_type === 'heading' ||
      (c.label || '').toLowerCase().includes('judul') ||
      (c.props?.dom as any)?.tag === 'h1' ||
      (c.props?.dom as any)?.tag === 'h2',
  )
  const subtitle = components.find(
    (c) =>
      c !== heading &&
      (c.component_type === 'text' ||
        (c.props?.dom as any)?.tag === 'p' ||
        (c.label || '').toLowerCase().includes('kelola gateway') ||
        (c.label || '').toLowerCase().includes('subjudul')),
  )

  const isInputComp = (c: ReconstructionComponent) => {
    const t = c.component_type
    const domTag = ((c.props?.dom as any)?.tag || '').toLowerCase()
    const domType = ((c.props?.dom as any)?.inputType || '').toLowerCase()
    return (
      t === 'input' ||
      t === 'field' ||
      domTag === 'input' ||
      domType === 'password' ||
      domType === 'checkbox' ||
      domType === 'text'
    )
  }

  const inputs = components.filter((c) => isInputComp(c) && !isCheckboxComp(c))
  const checkbox = components.find((c) => isCheckboxComp(c))
  const forgotLink = components.find(
    (c) =>
      c.component_type === 'link' ||
      (c.label || '').toLowerCase().includes('lupa password') ||
      (c.label || '').toLowerCase().includes('forgot'),
  )

  const isButtonComp = (c: ReconstructionComponent) => {
    const t = c.component_type
    return t === 'button' || t === 'action' || (c.label || '').toLowerCase().startsWith('tombol ')
  }

  // Tombol submit utama
  const submitButton = components.find(
    (c) =>
      isButtonComp(c) &&
      ((c.label || '').toLowerCase().includes('masuk') ||
        (c.label || '').toLowerCase().includes('login') ||
        (c.label || '').toLowerCase().includes('submit') ||
        (c.props?.dom as any)?.inputType === 'submit'),
  )

  // Tombol-tombol aksi sekunder (mis. Auto-fill Demo)
  const secondaryButtons = components.filter(
    (c) =>
      isButtonComp(c) &&
      c !== submitButton &&
      !((c.label || '').toLowerCase().includes('tampilkan') || (c.label || '').toLowerCase().includes('mata')),
  )

  // Teks footer hak cipta / badge gateway
  const footerComponents = components.filter(
    (c) =>
      (c.component_type === 'text' || c.component_type === 'field' || c.component_type === 'container') &&
      c !== heading &&
      c !== subtitle &&
      !isInputComp(c) &&
      !isButtonComp(c) &&
      ((c.label || '').toLowerCase().includes('hak cipta') ||
        (c.label || '').toLowerCase().includes('copyright') ||
        (c.label || '').toLowerCase().includes('gateway v') ||
        (c.label || '').toLowerCase().includes('footer')),
  )

  return (
    <div
      className="flex min-h-[460px] w-full items-center justify-center rounded-xl p-4 sm:p-8"
      style={{ backgroundColor: pageBg, fontFamily: pageFont }}
    >
      <div
        className="w-full max-w-[416px] rounded-2xl border p-6 sm:p-8 space-y-5 transition-all shadow-md"
        style={cardStyle}
      >
        {/* Logo */}
        <div className="flex justify-center">
          {logo ? (
            <RenderLogo comp={logo} />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white shadow-sm font-bold text-lg">
              N
            </span>
          )}
        </div>

        {/* Header Judul & Subjudul */}
        <div className="text-center space-y-1">
          <h1
            className="text-xl font-bold tracking-tight text-slate-900"
            style={{
              ...headingStyle,
              ...pickSafeStyles((heading?.props?.dom as any)?.style),
            }}
          >
            {cleanLabel(heading ? ((heading.props?.dom as any)?.text || heading.label) : 'Portal Masuk')}
          </h1>
          {subtitle && (
            <p
              className="text-xs text-slate-500 leading-relaxed"
              style={{
                ...bodyStyle,
                ...pickSafeStyles((subtitle.props?.dom as any)?.style),
              }}
            >
              {(subtitle.props?.dom as any)?.text || cleanLabel(subtitle.label)}
            </p>
          )}
        </div>

        {/* Form Inputs */}
        <div className="space-y-4 pt-1">
          {inputs.map((inp) => (
            <RenderInputField
              key={inp.id}
              comp={inp}
              showPassword={showPassword}
              onTogglePassword={onTogglePassword}
            />
          ))}

          {/* Baris Checkbox Ingat Saya & Link Lupa Password */}
          {(checkbox || forgotLink) && (
            <div className="flex items-center justify-between text-xs pt-0.5">
              {checkbox ? (
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>{cleanLabel((checkbox.props?.dom as any)?.text || checkbox.label || 'Ingat Saya')}</span>
                </label>
              ) : (
                <span />
              )}
              {forgotLink && (
                <span className="font-medium text-brand-600 hover:text-brand-700 hover:underline cursor-pointer select-none">
                  {cleanLabel((forgotLink.props?.dom as any)?.text || forgotLink.label || 'Lupa Password?')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tombol Submit & Sekunder */}
        <div className="space-y-3 pt-2">
          {submitButton ? (
            <button
              type="button"
              className="w-full py-2.5 px-4 text-center font-semibold text-sm transition-all shadow hover:opacity-95 active:scale-[0.99] flex items-center justify-center gap-2"
              style={{
                ...primaryStyle,
                ...pickSafeStyles((submitButton.props?.dom as any)?.style),
              }}
            >
              <span>{cleanLabel((submitButton.props?.dom as any)?.text || submitButton.label || 'Masuk ke Portal')}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="w-full py-2.5 px-4 text-center font-semibold text-sm rounded-lg bg-brand-600 text-white shadow"
            >
              Masuk ke Portal
            </button>
          )}

          {secondaryButtons.map((btn) => (
            <div key={btn.id} className="flex justify-center">
              <button
                type="button"
                className="py-1 px-3.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors flex items-center gap-1.5"
                style={pickSafeStyles((btn.props?.dom as any)?.style)}
              >
                <span>{cleanLabel((btn.props?.dom as any)?.text || btn.label)}</span>
              </button>
            </div>
          ))}
        </div>

        {/* Footer info (Versi / Hak Cipta) */}
        {footerComponents.length > 0 && (
          <div className="border-t border-slate-100 pt-3 text-center space-y-1">
            {footerComponents.map((f) => (
              <p key={f.id} className="text-[11px] text-slate-400">
                {(f.props?.dom as any)?.text || cleanLabel(f.label)}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function isCheckboxComp(c: ReconstructionComponent): boolean {
  const domType = ((c.props?.dom as any)?.inputType || '').toLowerCase()
  return (
    c.component_type === 'checkbox' ||
    domType === 'checkbox' ||
    (c.label || '').toLowerCase().includes('checkbox') ||
    (c.label || '').toLowerCase().includes('ingat saya')
  )
}

function RenderLogo({ comp }: { comp: ReconstructionComponent }) {
  const icon = getComponentIcon(comp)
  if (icon.imgSrc) {
    return (
      <img
        src={icon.imgSrc}
        alt={icon.imgAlt || 'Logo'}
        className="h-11 w-auto object-contain max-h-12"
      />
    )
  }
  if (icon.svg) {
    return <SafeIcon svgString={icon.svg} className="h-10 w-10 text-brand-600" />
  }
  return (
    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white shadow-sm font-bold text-lg">
      N
    </span>
  )
}

function RenderInputField({
  comp,
  showPassword,
  onTogglePassword,
}: {
  comp: ReconstructionComponent
  showPassword: boolean
  onTogglePassword: () => void
}) {
  const dom = (comp.props?.dom as Record<string, any>) || {}
  const domStyle = pickSafeStyles(dom.style || (comp.props?.style as any))
  const icon = getComponentIcon(comp)
  const isPassword =
    comp.component_type === 'password' ||
    dom.inputType === 'password' ||
    (comp.props?.input_type === 'password') ||
    (comp.label || '').toLowerCase().includes('password')

  const placeholder =
    comp.props?.placeholder ||
    dom.placeholder ||
    (isPassword ? '••••••••' : (comp.label || '').toLowerCase().includes('email') ? 'nama@contoh.com' : '')

  const label = cleanLabel(comp.label || (isPassword ? 'Password' : 'Input'))

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-700">{label}</label>
      <div className="relative flex items-center">
        {/* Ikon input di sebelah kiri jika ada */}
        {icon.svg ? (
          <div className="absolute left-3 flex items-center pointer-events-none text-slate-400">
            <SafeIcon svgString={icon.svg} className="h-4 w-4" />
          </div>
        ) : isPassword ? (
          <div className="absolute left-3 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
        ) : label.toLowerCase().includes('email') ? (
          <div className="absolute left-3 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
              />
            </svg>
          </div>
        ) : null}

        {/* Input nyata dengan style terpasang */}
        <input
          type={isPassword ? (showPassword ? 'text' : 'password') : 'text'}
          placeholder={String(placeholder)}
          readOnly
          className={cn(
            'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
            (icon.svg || isPassword || label.toLowerCase().includes('email')) && 'pl-9',
            isPassword && 'pr-10',
          )}
          style={domStyle}
        />

        {/* Tombol mata toggle password jika field password */}
        {isPassword && (
          <button
            type="button"
            onClick={onTogglePassword}
            tabIndex={-1}
            title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
            className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
          >
            {showPassword ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

/* =========================================================================
 * 2. Dashboard / App Preview Renderer
 * ========================================================================= */

interface DashboardPreviewProps {
  hasSidebar: boolean
  hasHeader: boolean
  sidebarComponents: ReconstructionComponent[]
  headerComponents: ReconstructionComponent[]
  mainComponents: ReconstructionComponent[]
  pageBg: string
  pageFont: string
  headingStyle: React.CSSProperties
  bodyStyle: React.CSSProperties
  cardStyle: React.CSSProperties
  primaryStyle: React.CSSProperties
}

function DashboardPreview({
  hasSidebar,
  hasHeader,
  sidebarComponents,
  headerComponents,
  mainComponents,
  pageBg,
  pageFont,
  headingStyle,
  bodyStyle,
  cardStyle,
  primaryStyle,
}: DashboardPreviewProps) {
  // Komponen judul utama di main
  const headings = mainComponents.filter(
    (c) =>
      c.component_type === 'heading' ||
      (c.props?.dom as any)?.tag === 'h1' ||
      (c.props?.dom as any)?.tag === 'h2',
  )

  // Tombol-tombol aksi utama
  const actionButtons = mainComponents.filter(
    (c) =>
      c.component_type === 'button' ||
      c.component_type === 'action' ||
      (c.label || '').toLowerCase().startsWith('tombol '),
  )

  // Metrik / Stat Cards (Total APIs, Active Services, dll.)
  const metricCards = mainComponents.filter(
    (c) =>
      (c.label || '').toLowerCase().includes('statistik') ||
      (c.label || '').toLowerCase().includes('total ') ||
      (c.label || '').toLowerCase().includes('rate') ||
      (c.label || '').toLowerCase().includes('trends'),
  )

  // Tabel atau section lain
  const tables = mainComponents.filter(
    (c) => c.component_type === 'table' || (c.label || '').toLowerCase().includes('tabel'),
  )

  return (
    <div
      className="flex min-h-[480px] w-full flex-col rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm"
      style={{ fontFamily: pageFont }}
    >
      {/* Header Bar */}
      {hasHeader && (
        <header className="flex h-13 items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-xs text-slate-800">
              API Nigma Portal
            </span>
          </div>
          <div className="flex items-center gap-2">
            {headerComponents.length > 0 ? (
              headerComponents.map((hc) => (
                <span
                  key={hc.id}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600"
                >
                  {cleanLabel(hc.label || 'Item')}
                </span>
              ))
            ) : (
              <span className="h-7 w-7 rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 flex items-center justify-center">
                AD
              </span>
            )}
          </div>
        </header>
      )}

      {/* Body: Sidebar + Main */}
      <div className="flex flex-1 min-h-[420px]">
        {/* Sidebar */}
        {hasSidebar && (
          <aside className="w-48 sm:w-56 shrink-0 border-r border-slate-200 bg-slate-50/70 p-3 flex flex-col gap-1">
            <div className="px-2 py-2 mb-1 flex items-center gap-2 border-b border-slate-200/60 pb-2.5">
              <span className="h-6 w-6 rounded-md bg-brand-600 text-white text-[11px] font-bold flex items-center justify-center">
                N
              </span>
              <span className="text-xs font-semibold text-slate-800 truncate">
                Nigma Gateway
              </span>
            </div>
            <nav className="space-y-0.5">
              {sidebarComponents.length > 0 ? (
                sidebarComponents.map((item, idx) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors',
                      idx === 0
                        ? 'bg-brand-50 text-brand-700 font-semibold'
                        : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                    <span className="truncate">{cleanLabel(item.label || 'Menu')}</span>
                  </div>
                ))
              ) : (
                <>
                  <div className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700">
                    Dashboard Overview
                  </div>
                  <div className="px-2.5 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100">
                    Katalog Error
                  </div>
                  <div className="px-2.5 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100">
                    Playground HTTP
                  </div>
                </>
              )}
            </nav>
          </aside>
        )}

        {/* Main Content Area */}
        <main
          className="flex-1 p-4 sm:p-6 space-y-5 overflow-auto"
          style={{ backgroundColor: pageBg }}
        >
          {/* Header Judul Utama Halaman */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-4">
            <div>
              <h2
                className="text-lg font-bold text-slate-900"
                style={headingStyle}
              >
                {headings[0] ? cleanLabel((headings[0].props?.dom as any)?.text || headings[0].label) : 'Overview'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5" style={bodyStyle}>
                Ringkasan gateway dan status layanan aktif hasil rekonstruksi.
              </p>
            </div>

            {/* Aksi Utama */}
            {actionButtons.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {actionButtons.slice(0, 3).map((btn, idx) => (
                  <button
                    key={btn.id}
                    type="button"
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-lg transition-all shadow-sm',
                      idx === 0
                        ? 'text-white'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50',
                    )}
                    style={idx === 0 ? primaryStyle : undefined}
                  >
                    {cleanLabel((btn.props?.dom as any)?.text || btn.label)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Stat Cards / Metric Grid */}
          {metricCards.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {metricCards.map((card, idx) => (
                <div
                  key={card.id}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-1"
                  style={cardStyle}
                >
                  <p className="text-[11px] font-medium text-slate-500 truncate">
                    {cleanLabel(card.label || `Metrik ${idx + 1}`)}
                  </p>
                  <p className="text-xl font-bold text-slate-900">
                    {cleanLabel((card.props?.dom as any)?.text || (idx === 0 ? '12 APIs' : idx === 1 ? '99.98%' : '48.2k'))}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm" style={cardStyle}>
                <p className="text-[11px] text-slate-500">Total APIs</p>
                <p className="text-xl font-bold text-slate-900">14 Active</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm" style={cardStyle}>
                <p className="text-[11px] text-slate-500">Uptime</p>
                <p className="text-xl font-bold text-slate-900">99.9%</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm" style={cardStyle}>
                <p className="text-[11px] text-slate-500">Requests Today</p>
                <p className="text-xl font-bold text-slate-900">128.4k</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm" style={cardStyle}>
                <p className="text-[11px] text-slate-500">Error Rate</p>
                <p className="text-xl font-bold text-emerald-600">0.02%</p>
              </div>
            </div>
          )}

          {/* Tabel / Matrix Live */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" style={cardStyle}>
            <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-800">
                {tables[0] ? cleanLabel(tables[0].label) : 'Live Service Matrix'}
              </h3>
              <span className="text-[11px] text-slate-400">Terpantau otomatis</span>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500">
                    <th className="pb-2 font-medium">Service Name</th>
                    <th className="pb-2 font-medium">Endpoint</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr>
                    <td className="py-2.5 font-medium text-slate-900">SIMRS NigmaCare</td>
                    <td className="py-2.5 font-mono text-[11px]">/api/v2/simrs</td>
                    <td className="py-2.5">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        Operational
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-500">42ms</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-medium text-slate-900">PIMS Mobile API</td>
                    <td className="py-2.5 font-mono text-[11px]">/api/v1/pims</td>
                    <td className="py-2.5">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        Operational
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-500">58ms</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-medium text-slate-900">Mobile Services (e-KYC)</td>
                    <td className="py-2.5 font-mono text-[11px]">/api/v2/ekyc</td>
                    <td className="py-2.5">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        Operational
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-500">76ms</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
