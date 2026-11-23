import { useCallback, useEffect, useState } from 'react'
import { applicationsApi, projectsApi, ApiError } from '../lib/api'
import type { Application, Project } from '../lib/api'
import {
  simulationApi,
  type GenerateSimulationResult,
  type ProjectRuntimeInfo,
} from '../lib/simulation'
import { useAuth } from '../lib/auth'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  ScrollArea,
} from '../components/ui'

export function SimulationBuilderPage() {
  const { can } = useAuth()
  const [apps, setApps] = useState<Application[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [appId, setAppId] = useState<number | null>(null)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [simName, setSimName] = useState('Simulasi Demo')

  // Generator state
  const [generateResult, setGenerateResult] = useState<GenerateSimulationResult | null>(null)
  const [runtimeInfo, setRuntimeInfo] = useState<ProjectRuntimeInfo | null>(null)
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)

  // Load applications on mount
  useEffect(() => {
    void (async () => {
      try {
        const page = await applicationsApi.list()
        setApps(page.items)
        const approved = page.items.find((a) => a.authorization_status === 'approved')
        if (approved) setAppId(approved.id)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Gagal memuat aplikasi')
      }
    })()
  }, [])

  // Load projects when app changes
  useEffect(() => {
    if (!appId) {
      setProjects([])
      setProjectId(null)
      return
    }
    void (async () => {
      try {
        const page = await projectsApi.listByApplication(appId)
        setProjects(page.items)
        if (page.items.length > 0) setProjectId(page.items[0].id)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Gagal memuat project')
      }
    })()
  }, [appId])

  // Load runtime info when project changes
  const loadRuntimeInfo = useCallback(async () => {
    if (!projectId) {
      setRuntimeInfo(null)
      return
    }
    try {
      const info = await simulationApi.runtime(projectId)
      setRuntimeInfo(info)
    } catch {
      setRuntimeInfo({ exists: false } as ProjectRuntimeInfo)
    }
  }, [projectId])

  useEffect(() => {
    void loadRuntimeInfo()
  }, [loadRuntimeInfo])

  // Handle generate button click
  const handleGenerateClick = () => {
    if (!projectId) return
    if (runtimeInfo?.exists) {
      setShowOverwriteConfirm(true)
    } else {
      void doGenerate(false)
    }
  }

  // Execute generation
  const doGenerate = async (overwrite: boolean) => {
    if (!projectId) return
    setGenerating(true)
    setError(null)
    setNotice(null)
    try {
      const result = await simulationApi.generate(projectId, { overwrite })
      setGenerateResult(result)
      setNotice(
        `Simulasi dibuat: ${result.screens.length} layar, ${result.errors.length} gagal, ${result.skipped.length} dilewati.`,
      )
      // Refresh runtime info to get updated state
      void loadRuntimeInfo()
    } catch (err) {
      if (err instanceof ApiError) {
        const details = err.details as Record<string, unknown> | undefined
        if (err.status === 409 && details?.exists) {
          // Slug collision - should have been caught by overwrite confirm
          setShowOverwriteConfirm(true)
          return
        }
        setError(err.message)
      } else {
        setError('Gagal membuat simulasi runtime')
      }
    } finally {
      setGenerating(false)
      setShowOverwriteConfirm(false)
    }
  }

  // Confirm overwrite
  const confirmOverwrite = () => {
    void doGenerate(true)
  }

  // Build runtime URL
  const runtimeUrl = generateResult
    ? `${window.location.protocol}//${window.location.hostname}:5180/?app=${generateResult.slug}`
    : runtimeInfo?.slug
    ? `${window.location.protocol}//${window.location.hostname}:5180/?app=${runtimeInfo.slug}`
    : null

  // Clear states when project changes
  useEffect(() => {
    setGenerateResult(null)
    setShowOverwriteConfirm(false)
  }, [projectId])

  return (
    <div>
      <PageHeader
        title="Simulation Builder"
        description="Bangun aplikasi React hidup dari rekonstruksi yang disetujui. Output ditulis ke simulation-runtime."
        actions={
          runtimeUrl && (
            <a
              href={runtimeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded bg-[#4268ff] px-4 text-sm font-medium text-white transition-colors hover:bg-[#3257e6] active:bg-[#2c4fd1]"
            >
              Buka di Runtime
            </a>
          )
        }
      />

      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert tone="danger" title="Gagal">{error}</Alert>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Aplikasi">
            <select
              className="input min-w-[170px]"
              value={appId ?? ''}
              onChange={(e) => {
                setAppId(Number(e.target.value) || null)
                setProjectId(null)
              }}
            >
              <option value="">— pilih —</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Project">
            <select
              className="input min-w-[170px]"
              value={projectId ?? ''}
              onChange={(e) => setProjectId(Number(e.target.value) || null)}
            >
              <option value="">— pilih —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Nama simulasi">
            <input
              className="input min-w-[200px]"
              value={simName}
              onChange={(e) => setSimName(e.target.value)}
            />
          </Field>

          {can('simulation:write') && (
            <div className="flex items-center gap-2">
              <Button
                onClick={handleGenerateClick}
                disabled={!projectId || generating}
                loading={generating}
              >
                {runtimeInfo?.exists ? 'Bangun ulang' : 'Bangun simulasi'}
              </Button>
              {runtimeInfo?.exists && (
                <Alert tone="info" title="Catatan produksi">
                  <p className="text-xs">
                    <strong>Development only:</strong> Backend tidak menjalankan <code>npm run build</code>.
                    Untuk produksi, rebuild manual runtime: <code>cd simulation-runtime && npm run build</code>.
                  </p>
                </Alert>
              )}
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Simulasi dibangun dari rekonstruksi yang statusnya sudah <strong>disetujui</strong>.
          Kalau belum ada, buka UI Reconstruction dulu lalu setujui drafnya.
        </p>
      </Card>

      {!projectId && !generateResult && !runtimeInfo?.exists && (
        <div className="mt-4">
          <EmptyState
            title="Pilih project"
            description="Pilih aplikasi dan project untuk memulai pembuatan simulasi runtime."
          />
        </div>
      )}

      {generateResult && (
        <div className="mt-4 space-y-4">
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Card className="text-center">
              <p className="text-3xl font-bold text-brand-700">{generateResult.screens.length}</p>
              <p className="text-xs text-slate-500">Layar dibuat</p>
            </Card>
            <Card className="text-center">
              <p className="text-3xl font-bold text-rose-700">{generateResult.errors.length}</p>
              <p className="text-xs text-slate-500">Layar gagal</p>
            </Card>
            <Card className="text-center">
              <p className="text-3xl font-bold text-amber-700">{generateResult.skipped.length}</p>
              <p className="text-xs text-slate-500">Versi dilewati</p>
            </Card>
            <Card className="text-center">
              <p className="text-3xl font-bold text-emerald-700">
                {generateResult.assumptions.reduce((sum, g) => sum + g.items.length, 0)}
              </p>
              <p className="text-xs text-slate-500">Asumsi</p>
            </Card>
          </div>

          {/* Generated screens */}
          {generateResult.screens.length > 0 && (
            <Card title="Layar yang dibuat" description="Halaman yang tersedia di runtime.">
              <ul className="divide-y divide-slate-100">
                {generateResult.screens.map((screen) => (
                  <li key={screen.key} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-slate-900">{screen.title}</p>
                      <p className="truncate text-xs text-slate-500">{screen.route}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge tone="info">{screen.kind}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Errors */}
          {generateResult.errors.length > 0 && (
            <Card
              title="Layar yang gagal dibuat"
              className="border-rose-200"
              description="Layar berikut tidak bisa digenerate dari rekonstruksi yang disetujui."
            >
              <Alert tone="danger" title="Gagal" className="mb-3">
                Layar berikut tidak bisa digenerate dari rekonstruksi yang disetujui.
              </Alert>
              <ul className="space-y-2">
                {generateResult.errors.map((err, idx) => (
                  <li key={idx} className="rounded border border-rose-200 bg-rose-50 p-3">
                    <p className="text-[13px] font-medium text-rose-900">
                      {err.screen_title || err.screen_key || '(tanpa judul)'}
                    </p>
                    <p className="mt-1 text-xs text-rose-700">{err.reason}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Skipped versions */}
          {generateResult.skipped.length > 0 && (
            <Card title="Versi layar yang dilewati" description="Versi capture lain yang tidak dipakai karena belum disetujui.">
              <ul className="space-y-2">
                {generateResult.skipped.map((item) => (
                  <li key={`${item.screen_id}-${item.capture_version}`} className="rounded border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[13px] font-medium text-amber-900">
                      {item.screen_title} (screen id {item.screen_id}, capture v{item.capture_version})
                    </p>
                    <p className="mt-1 text-xs text-amber-700">{item.reason}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Assumptions */}
          {generateResult.assumptions.length > 0 && (
            <Card title="Asumsi per layar" description="Asumsi dari rekonstruksi yang disetujui. Topik, deskripsi, confidence, dan status review.">
              <ScrollArea style={{ maxHeight: 400 }}>
                {generateResult.assumptions.map((group) => (
                  <div key={group.route} className="mb-4 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                    <p className="text-[13px] font-semibold text-slate-900">{group.screen_title} <span className="font-normal text-slate-500">({group.route})</span></p>
                    {group.items.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-500">Tidak ada asumsi khusus dari rekonstruksi.</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {group.items.map((item, idx) => (
                          <li key={idx} className="rounded border border-slate-200 bg-white p-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-medium text-slate-700">[{item.confidence}]</span>
                              <span className="text-[11px] font-semibold text-slate-900">{item.topic}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded`}
                                style={{
                                  backgroundColor: item.resolved ? '#dcfce7' : '#fef3c7',
                                  color: item.resolved ? '#166534' : '#92400e',
                                }}
                              >
                                {item.resolved ? 'sudah ditinjau' : 'belum ditinjau'}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </ScrollArea>

              <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                <p><strong>Asumsi umum:</strong></p>
                <p>• Seluruh data pada simulasi ini fiktif dan dihasilkan deterministik dari slug + nama dataset.</p>
                <p>• Simulasi tidak memanggil API asli dan tidak menyimpan kredensial aplikasi sumber.</p>
                <p>• Tombol yang tidak punya aturan bisnis eksplisit hanya menampilkan notifikasi simulasi.</p>
                <p>• Tabel, kolom, dan field diambil dari rekonstruksi yang disetujui; field yang tidak terlihat tidak ditambahkan.</p>
                <p>• Data tabel disimpan di IndexedDB browser dan bisa dikembalikan ke seed lewat tombol reset runtime.</p>
              </div>
            </Card>
          )}

          {/* Runtime info */}
          <Card title="Informasi Runtime">
            <dl className="grid gap-2 sm:grid-cols-2 text-[13px]">
              <dt className="text-slate-500">Slug</dt>
              <dd className="font-mono text-slate-900">{generateResult.slug}</dd>
              <dt className="text-slate-500">Nama</dt>
              <dd className="text-slate-900">{generateResult.name}</dd>
              <dt className="text-slate-500">Folder runtime</dt>
              <dd className="font-mono text-slate-900 truncate max-w-xs">{generateResult.runtime_dir}</dd>
              <dt className="text-slate-500">Dibuat</dt>
              <dd className="text-slate-900">{new Date(generateResult.generated_at).toLocaleString('id-ID')}</dd>
              {generateResult.backup_dir && (
                <>
                  <dt className="text-slate-500">Backup sebelumnya</dt>
                  <dd className="font-mono text-slate-900 truncate max-w-xs">{generateResult.backup_dir}</dd>
                </>
              )}
            </dl>

            <div className="mt-3 pt-3 border-t border-slate-100">
              <Alert tone="info" title="Catatan development">
                <p className="text-xs">
                  <strong>Runtime port 5180</strong> harus berjalan terpisah. Backend hanya menulis file ke
                  <code>simulation-runtime/apps/{generateResult.slug}/</code> dan mengupdate
                  <code>registry.json</code>. Untuk produksi, jalankan <code>npm run build</code> di folder
                  <code>simulation-runtime</code>.
                </p>
              </Alert>
            </div>
          </Card>
        </div>
      )}

      {!generateResult && projectId && !runtimeInfo?.exists && (
        <div className="mt-4">
          <EmptyState
            title="Belum ada simulasi runtime"
            description="Klik 'Bangun simulasi' untuk membuat aplikasi React hidup dari rekonstruksi yang disetujui."
          />
        </div>
      )}

      {!generateResult && runtimeInfo?.exists && (
        <div className="mt-4 space-y-4">
          <Alert tone="success" title="Simulasi runtime sudah ada">
            <p className="text-xs">
              Project ini sudah memiliki simulasi runtime (<strong>{runtimeInfo.slug}</strong>).
              Klik 'Bangun ulang' untuk memperbarui, atau buka langsung di runtime.
            </p>
          </Alert>

          {runtimeInfo.screens && runtimeInfo.screens.length > 0 && (
            <Card title="Layar yang tersedia">
              <ul className="divide-y divide-slate-100">
                {runtimeInfo.screens.map((screen) => (
                  <li key={screen.key} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-slate-900">{screen.title}</p>
                      <p className="truncate text-xs text-slate-500">{screen.route}</p>
                    </div>
                    <Badge tone="info">{screen.kind}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {runtimeInfo.errors && runtimeInfo.errors.length > 0 && (
            <Card
              title="Layar yang gagal dibuat"
              className="border-rose-200"
              description="Layar berikut tidak bisa digenerate dari rekonstruksi yang disetujui."
            >
              <Alert tone="danger" title="Gagal" className="mb-3">
                Layar berikut tidak bisa digenerate dari rekonstruksi yang disetujui.
              </Alert>
              <ul className="space-y-2">
                {runtimeInfo.errors.map((err, idx) => (
                  <li key={idx} className="rounded border border-rose-200 bg-rose-50 p-3">
                    <p className="text-[13px] font-medium text-rose-900">
                      {err.screen_title || err.screen_key || '(tanpa judul)'}
                    </p>
                    <p className="mt-1 text-xs text-rose-700">{err.reason}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {runtimeInfo.skipped && runtimeInfo.skipped.length > 0 && (
            <Card title="Versi layar yang dilewati">
              <ul className="space-y-2">
                {runtimeInfo.skipped.map((item) => (
                  <li key={`${item.screen_id}-${item.capture_version}`} className="rounded border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[13px] font-medium text-amber-900">
                      {item.screen_title} (screen id {item.screen_id}, capture v{item.capture_version})
                    </p>
                    <p className="mt-1 text-xs text-amber-700">{item.reason}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {runtimeInfo.assumptions && runtimeInfo.assumptions.length > 0 && (
            <Card title="Asumsi per layar">
              <ScrollArea style={{ maxHeight: 300 }}>
                {runtimeInfo.assumptions.map((group) => (
                  <div key={group.route} className="mb-4 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                    <p className="text-[13px] font-semibold text-slate-900">{group.screen_title} <span className="font-normal text-slate-500">({group.route})</span></p>
                    {group.items.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-500">Tidak ada asumsi khusus dari rekonstruksi.</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {group.items.map((item, idx) => (
                          <li key={idx} className="rounded border border-slate-200 bg-white p-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-medium text-slate-700">[{item.confidence}]</span>
                              <span className="text-[11px] font-semibold text-slate-900">{item.topic}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded`}
                                style={{
                                  backgroundColor: item.resolved ? '#dcfce7' : '#fef3c7',
                                  color: item.resolved ? '#166534' : '#92400e',
                                }}
                              >
                                {item.resolved ? 'sudah ditinjau' : 'belum ditinjau'}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </ScrollArea>
            </Card>
          )}
        </div>
      )}

      {/* Overwrite confirmation modal */}
      <Modal
        open={showOverwriteConfirm}
        title="Simulasi sudah ada"
        description={`Simulasi '${runtimeInfo?.slug}' sudah ada di runtime. Menimpa akan membuat backup otomatis ke simulation-runtime/.backups/ sebelum menulis ulang.`}
        onClose={() => setShowOverwriteConfirm(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowOverwriteConfirm(false)}>
              Batal
            </Button>
            <Button variant="danger" onClick={confirmOverwrite} loading={generating}>
              Timpa (backup otomatis)
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-xs text-slate-600">
          <p>• Backup akan disimpan di <code>simulation-runtime/.backups/{runtimeInfo?.slug}-&lt;timestamp&gt;/</code></p>
          <p>• Folder apps lama akan dihapus dan diganti dengan hasil generate baru</p>
          <p>• <code>registry.json</code> diupdate secara atomik</p>
          <p>• Backend <strong>tidak</strong> menjalankan <code>npm run build</code>; produksi perlu rebuild manual</p>
        </div>
      </Modal>
    </div>
  )
}