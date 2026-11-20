import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { applicationsApi, projectsApi, ApiError } from '../lib/api'
import type { Application, Project } from '../lib/api'
import { captureApi, getWorkerUrl, screensApi, setWorkerUrl, workerApi } from '../lib/capture'
import type { CaptureSession, Screen, WorkerHealth, WorkerState } from '../lib/capture'
import { useAuth } from '../lib/auth'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
} from '../components/ui'
import { IconExternal } from '../components/icons'

const STATUS_LABEL: Record<string, { label: string; tone: 'neutral' | 'success' | 'warning' | 'info' }> = {
  active: { label: 'Siap', tone: 'info' },
  running: { label: 'Browser terbuka', tone: 'success' },
  paused: { label: 'Dijeda', tone: 'warning' },
  stopped: { label: 'Selesai', tone: 'neutral' },
  saved: { label: 'Tersimpan', tone: 'neutral' },
}

export function CaptureStudioPage() {
  const { can } = useAuth()
  const [apps, setApps] = useState<Application[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [appId, setAppId] = useState<number | null>(null)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [session, setSession] = useState<CaptureSession | null>(null)
  const [workerState, setWorkerState] = useState<WorkerState | null>(null)
  const [screens, setScreens] = useState<Screen[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [workerError, setWorkerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [focusing, setFocusing] = useState(false)
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'phone'>('desktop')
  const [fullPage, setFullPage] = useState(false)
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null)
  const [workerHealth, setWorkerHealth] = useState<WorkerHealth | null>(null)
  const [checkingWorker, setCheckingWorker] = useState(false)
  const [isConflict, setIsConflict] = useState(false)
  const [workerUrl, setWorkerUrlState] = useState<string>(() => getWorkerUrl())
  const [showConfigWorker, setShowConfigWorker] = useState(false)
  const [workerUrlInput, setWorkerUrlInput] = useState<string>(() => getWorkerUrl())

  const isRemoteHostWithLocalWorker = useMemo(() => {
    if (typeof window === 'undefined') return false
    const host = window.location.hostname.toLowerCase()
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
    const workerIsLocal = workerUrl.includes('127.0.0.1') || workerUrl.includes('localhost')
    return !isLocalHost && workerIsLocal
  }, [workerUrl])

  const checkWorkerConnection = useCallback(async () => {
    setCheckingWorker(true)
    try {
      const h = await workerApi.health()
      setWorkerHealth(h)
      setWorkerOnline(true)
      setWorkerError(null)
    } catch {
      setWorkerHealth(null)
      setWorkerOnline(false)
    } finally {
      setCheckingWorker(false)
    }
  }, [])

  useEffect(() => {
    void checkWorkerConnection()
  }, [checkWorkerConnection])

  // Muat daftar aplikasi
  useEffect(() => {
    void (async () => {
      try {
        const page = await applicationsApi.list()
        setApps(page.items)
        const approved = page.items.filter((a) => a.authorization_status === 'approved')
        if (approved.length > 0) setAppId(approved[0].id)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Gagal memuat aplikasi')
      }
    })()
  }, [])

  // Muat project saat aplikasi dipilih
  useEffect(() => {
    if (!appId) {
      setProjects([])
      return
    }
    void (async () => {
      try {
        const page = await projectsApi.listByApplication(appId)
        setProjects(page.items)
        setProjectId(page.items.length > 0 ? page.items[0].id : null)
        setSession(null)
        setWorkerState(null)
        setScreens([])
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Gagal memuat project')
      }
    })()
  }, [appId])

  // Muat screens saat project dipilih
  const loadScreens = useCallback(async () => {
    if (!projectId) return
    try {
      const page = await screensApi.list(projectId)
      setScreens(page.items)
    } catch {
      /* biarkan kosong */
    }
  }, [projectId])

  useEffect(() => {
    void loadScreens()
  }, [loadScreens])

  // Polling status worker di PERANGKAT INI (bukan worker di server).
  useEffect(() => {
    if (!session || session.status !== 'running') return
    const timer = setInterval(() => {
      void (async () => {
        try {
          const st = await workerApi.state()
          setWorkerState(st as WorkerState)
          setWorkerError(null)
        } catch {
          setWorkerError(
            'Worker capture tidak aktif di perangkat ini. Jalankan capture worker (port 8010) di perangkat yang ingin membuka browser.',
          )
        }
      })()
    }, 3000)
    return () => clearInterval(timer)
  }, [session])

  const selectedApp = useMemo(() => apps.find((a) => a.id === appId), [apps, appId])

  async function run<T>(action: () => Promise<T>, message: string): Promise<void> {
    setBusy(true)
    setError(null)
    setIsConflict(false)
    try {
      await action()
      setNotice(message)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Terjadi kesalahan'
      setError(msg)
      if ((err as any)?.status === 409 || msg.toLowerCase().includes('sudah berjalan')) {
        setIsConflict(true)
      }
    } finally {
      setBusy(false)
    }
  }

  async function createSession() {
    if (!projectId) return
    await run(async () => {
      const created = await captureApi.createSession(projectId, 'Sesi dari Capture Studio', device)
      setSession(created)
      setWorkerState(null)
    }, 'Sesi capture dibuat. Klik "Buka Browser" untuk memulai.')
  }

  async function startBrowser() {
    if (!session) return
    await run(async () => {
      // Cek dulu: worker harus berjalan di sesi interaktif perangkat ini,
      // kalau tidak, jendela Chromium tidak akan tampil di layar operator.
      let health: WorkerHealth | null = null
      try {
        health = await workerApi.health()
        setWorkerHealth(health)
      } catch {
        health = workerHealth
      }
      if (health && health.interactive === false) {
        throw new Error(
          `Worker berjalan di sesi NON-INTERAKTIF (SessionId=${health.windows_session_id ?? '?'}). ` +
            'Jendela Chromium tidak akan muncul di layar — worker kemungkinan dijalankan dari shell/proses latar belakang. ' +
            'Tutup worker itu, lalu jalankan ulang dengan double-click start-capture-worker.bat di root repo dari desktop Anda.',
        )
      }
      const cfg = await captureApi.launchConfig(session.id)
      await workerApi.startSession({
        url: cfg.url,
        viewport_width: cfg.viewport_width,
        viewport_height: cfg.viewport_height,
        allowed_hosts: cfg.allowed_hosts,
        device: cfg.device,
      })
      setSession((prev) => (prev ? { ...prev, status: 'running' } : prev))
      setWorkerError(null)
    }, 'Browser dibuka di perangkat ini. Silakan login secara manual di jendela browser.')
  }

  async function focusBrowser() {
    if (!session) return
    setFocusing(true)
    try {
      await workerApi.focus()
      setNotice('Jendela browser dimunculkan ke depan.')
      setWorkerError(null)
    } catch (err) {
      setWorkerError(err instanceof Error ? err.message : 'Gagal memfokuskan jendela browser')
    } finally {
      setFocusing(false)
    }
  }

  async function captureScreen() {
    if (!session) return
    await run(async () => {
      const meta: any = await workerApi.capture({
        label: 'screen',
        full_page: fullPage,
        include_image: true,
      })
      const screen = await captureApi.importCapture(session.id, {
        url: meta.url,
        title: meta.title,
        full_page: meta.full_page,
        png_base64: meta.png_base64,
        elements: meta.elements,
        structure: meta.structure,
        interactions: meta.interactions,
      })
      setScreens((prev) => [screen, ...prev])
      setWorkerError(null)
    }, 'Screenshot tersimpan di perangkat ini. Jangan lupa cek dan mask data sensitif.')
  }

  async function stopSession() {
    if (!session) return
    await run(async () => {
      await workerApi.stop()
      setSession((prev) => (prev ? { ...prev, status: 'stopped' } : prev))
      setWorkerState(null)
      setWorkerError(null)
    }, 'Sesi capture dihentikan.')
  }

  const canOperate = can('capture:operate')
  const status = session ? STATUS_LABEL[session.status] ?? STATUS_LABEL.active : null

  return (
    <div>
      <PageHeader
        title="Capture Studio"
        description="Buka browser, login manual, dan ambil screenshot aplikasi yang sudah diotorisasi."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs border border-slate-200 bg-slate-50">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  workerOnline === true
                    ? 'bg-emerald-500 shadow-sm shadow-emerald-400'
                    : workerOnline === false
                    ? 'bg-rose-500'
                    : 'bg-slate-300'
                }`}
              />
              <span className="font-medium text-slate-700">
                {workerOnline === true
                  ? `Worker Aktif (${workerUrl.replace(/^https?:\/\//, '')})`
                  : workerOnline === false
                  ? `Worker Terputus (${workerUrl.replace(/^https?:\/\//, '')})`
                  : 'Cek koneksi worker...'}
              </span>
              {workerHealth && workerHealth.interactive === false && (
                <span className="font-semibold text-rose-600">
                  · sesi non-interaktif (Sid {workerHealth.windows_session_id ?? '?'})
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant="secondary"
              loading={checkingWorker}
              onClick={checkWorkerConnection}
            >
              Cek koneksi
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowConfigWorker((v) => !v)}
              title="Atur alamat URL worker"
            >
              {showConfigWorker ? 'Tutup URL' : 'Ubah URL Worker'}
            </Button>
          </div>
        }
      />

      {isRemoteHostWithLocalWorker && (
        <div className="mb-4">
          <Alert tone="warning" title="Peringatan Koneksi Worker Lintas Perangkat">
            <div className="space-y-2 text-sm">
              <p>
                Anda sedang membuka panel admin melalui jaringan (<strong>{window.location.hostname}</strong>),
                namun Capture Worker masih diarahkan ke loopback lokal browser Anda (<code>{workerUrl}</code>).
              </p>
              <p className="font-semibold text-amber-900">
                Worker harus berjalan di perangkat yang sama dengan browser ini, atau ubah alamat worker.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    const newUrl = `http://${window.location.hostname}:8010`
                    setWorkerUrl(newUrl)
                    setWorkerUrlState(newUrl)
                    setWorkerUrlInput(newUrl)
                    setNotice(`Alamat worker diarahkan ke ${newUrl}`)
                    setTimeout(() => void checkWorkerConnection(), 100)
                  }}
                >
                  Gunakan Worker di Host Ini (http://{window.location.hostname}:8010)
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowConfigWorker(true)}
                >
                  Ketik Alamat URL Sendiri
                </Button>
              </div>
            </div>
          </Alert>
        </div>
      )}

      {showConfigWorker && (
        <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg shadow-sm">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[260px]">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Capture Worker (VITE_CAPTURE_WORKER_URL):
              </label>
              <input
                type="text"
                className="input text-xs h-8 py-1 font-mono"
                placeholder="mis. http://192.168.2.119:8010 atau http://127.0.0.1:8010"
                value={workerUrlInput}
                onChange={(e) => setWorkerUrlInput(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setWorkerUrl(workerUrlInput)
                setWorkerUrlState(workerUrlInput)
                setNotice(`Alamat worker diperbarui ke ${workerUrlInput}`)
                setTimeout(() => void checkWorkerConnection(), 100)
              }}
            >
              Simpan & Tes
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const def = `http://${window.location.hostname}:8010`
                setWorkerUrlInput(def)
                setWorkerUrl(def)
                setWorkerUrlState(def)
                setNotice(`Alamat worker disetel ke http://${window.location.hostname}:8010`)
                setTimeout(() => void checkWorkerConnection(), 100)
              }}
            >
              Ikuti Host ({window.location.hostname}:8010)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const def = 'http://127.0.0.1:8010'
                setWorkerUrlInput(def)
                setWorkerUrl(def)
                setWorkerUrlState(def)
                setNotice(`Alamat worker di-reset ke default (${def})`)
                setTimeout(() => void checkWorkerConnection(), 100)
              }}
            >
              Reset 127.0.0.1
            </Button>
          </div>
        </div>
      )}

      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert tone="danger" title="Gagal">
            <div className="space-y-2">
              <div>{error}</div>
              {(isConflict || error.toLowerCase().includes('sudah berjalan')) && (
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="danger"
                    loading={busy}
                    onClick={async () => {
                      try {
                        setBusy(true)
                        await workerApi.stop()
                        setIsConflict(false)
                        setError(null)
                        setNotice('Sesi lama berhasil dihentikan. Memulai browser baru...')
                        await startBrowser()
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Gagal menghentikan sesi lama')
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    Hentikan sesi lama & mulai baru
                  </Button>
                </div>
              )}
            </div>
          </Alert>
        </div>
      )}
      {workerError && (
        <div className="mb-4">
          <Alert tone="danger" title="Worker capture tidak tersedia">{workerError}</Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Aplikasi sumber">
          <Field label="Aplikasi">
            <select
              className="input"
              value={appId ?? ''}
              onChange={(e) => setAppId(Number(e.target.value) || null)}
            >
              <option value="">— pilih aplikasi —</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id} disabled={a.authorization_status !== 'approved'}>
                  {a.name}
                  {a.authorization_status !== 'approved' ? ' (belum diotorisasi)' : ''}
                </option>
              ))}
            </select>
          </Field>
          {selectedApp && (
            <p className="mt-3 text-xs text-slate-500">
              {selectedApp.source_url}
            </p>
          )}
        </Card>

        <Card title="Project">
          <Field label="Project">
            <select
              className="input"
              value={projectId ?? ''}
              onChange={(e) => {
                setProjectId(Number(e.target.value) || null)
                setSession(null)
                setWorkerState(null)
              }}
            >
              <option value="">— pilih project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.status}
                </option>
              ))}
            </select>
          </Field>
          {projects.length === 0 && appId && (
            <p className="mt-3 text-xs text-slate-500">
              Belum ada project. Buat dulu di halaman detail aplikasi.
            </p>
          )}
        </Card>
      </div>

      <Card title="Sesi capture" className="mt-4">
        {!canOperate ? (
          <Alert tone="warning">Akun Anda tidak memiliki izin menjalankan capture.</Alert>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <Field label="Tampilan perangkat" hint="Emulasi ukuran layar saat capture.">
                <select
                  className="input min-w-[190px]"
                  value={device}
                  onChange={(e) => setDevice(e.target.value as 'desktop' | 'tablet' | 'phone')}
                >
                  <option value="desktop">Desktop · 1440×900</option>
                  <option value="tablet">Tablet · 820×1180 (touch)</option>
                  <option value="phone">HP · 390×844 (touch)</option>
                </select>
              </Field>
            </div>

            {workerHealth && workerHealth.interactive === false && (
              <div className="mb-4">
                <Alert
                  tone="warning"
                  title={`Worker berjalan di sesi non-interaktif (SessionId ${workerHealth.windows_session_id ?? '?'})`}
                >
                  Jendela Chromium <strong>tidak akan muncul di layar Anda</strong> karena worker tidak
                  berjalan di sesi desktop interaktif (kemungkinan dari shell/proses latar belakang). Tutup
                  worker yang sedang berjalan, lalu jalankan ulang dengan <strong>double-click</strong>{' '}
                  <code className="font-mono">start-capture-worker.bat</code> di root repo dari desktop Anda
                  (atau <code className="font-mono">powershell -ExecutionPolicy Bypass -File .\start-capture-worker.ps1</code>{' '}
                  dari terminal Anda), kemudian klik "Cek koneksi".
                </Alert>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {!session && (
                <Button onClick={() => void createSession()} disabled={!projectId} loading={busy}>
                  Buat Sesi
                </Button>
              )}
              {session && session.status !== 'running' && session.status !== 'paused' && (
                <Button onClick={() => void startBrowser()} loading={busy}>
                  Buka Browser
                </Button>
              )}
              {session && session.status === 'running' && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => void focusBrowser()}
                    loading={focusing}
                    title="Jika jendela browser tersembunyi di belakang"
                  >
                    Fokuskan jendela
                  </Button>
                  <Button onClick={() => void captureScreen()} loading={busy}>
                    Ambil Screenshot
                  </Button>
                  <label className="flex items-center gap-2 cursor-pointer text-[12px] text-slate-600 hover:text-slate-800">
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      checked={fullPage}
                      onChange={(e) => setFullPage(e.target.checked)}
                    />
                    Capture halaman penuh (full page)
                  </label>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void workerApi.pause().then(() => {
                        setSession((prev) => (prev ? { ...prev, status: 'paused' } : prev))
                        setWorkerError(null)
                        setNotice('Sesi dijeda.')
                      })
                    }
                    loading={busy}
                  >
                    Jeda
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void workerApi.resume().then(() => {
                        setSession((prev) => (prev ? { ...prev, status: 'running' } : prev))
                        setWorkerError(null)
                        setNotice('Sesi dilanjutkan.')
                      })
                    }
                    loading={busy}
                  >
                    Lanjutkan
                  </Button>
                </>
              )}
              {session && (
                <Button variant="danger" onClick={() => void stopSession()} loading={busy}>
                  Hentikan
                </Button>
              )}
            </div>

            {session && (
              <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-500">Status sesi</p>
                  <p className="mt-0.5">
                    <Badge tone={status?.tone ?? 'neutral'}>{status?.label ?? session.status}</Badge>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Halaman aktif</p>
                  <p className="mt-0.5 truncate text-[13px] text-slate-800" title={workerState?.current_url ?? ''}>
                    {workerState?.current_url ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Interaksi terekam</p>
                  <p className="mt-0.5 text-[13px] tabular text-slate-800">
                    {workerState?.event_count ?? 0}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs leading-relaxed text-slate-600">
                <strong className="font-medium text-slate-700">Cara pakai:</strong> pastikan Capture Worker
                berjalan di <strong className="font-medium text-slate-700">perangkat yang sama</strong> di mana
                Anda ingin browser muncul (laptop Anda sendiri, atau HP jika worker dijalankan di HP). Tekan
                "Buka Browser" — jendela <strong className="font-medium text-slate-700">Chromium terpisah</strong>
                akan terbuka di perangkat itu (bukan tab Chrome Anda — disengaja agar profil & cookie pribadi
                Anda tidak tersentuh). Butuh 2–5 detik. Kalau jendelanya tersembunyi di belakang, tekan
                <strong className="font-medium text-slate-700">"Fokuskan jendela"</strong>. Login sendiri dengan
                akun resmi — NigmaSim tidak pernah menyimpan kredensial. Setelah sampai halaman yang ingin diambil,
                tekan "Ambil Screenshot" di halaman ini.
              </p>
            </div>
          </>
        )}
      </Card>

      <Card title="Screen yang tertangkap" className="mt-4">
        {screens.length === 0 ? (
          <EmptyState
            title="Belum ada screenshot"
            description="Screenshot yang diambil selama sesi ini akan muncul di sini."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {screens.map((screen) => (
              <li key={screen.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-slate-900">{screen.title}</p>
                  <p className="truncate text-xs text-slate-500">{screen.source_url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="warning">Pending</Badge>
                  <Link
                    to={`/screens?project=${projectId}&screen=${screen.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    Kelola <IconExternal size={12} />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <Link to={`/screens${projectId ? `?project=${projectId}` : ''}`} className="text-xs font-medium text-brand-600 hover:underline">
            Buka Screen Repository →
          </Link>
        </div>
      </Card>

      {!canOperate && (
        <div className="mt-4">
          <Alert tone="info" title="Izin">
            Role <span className="font-mono">capture_operator</span> atau{' '}
            <span className="font-mono">super_admin</span> diperlukan untuk menjalankan capture.
          </Alert>
        </div>
      )}
    </div>
  )
}
