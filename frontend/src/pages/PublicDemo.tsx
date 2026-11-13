import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { demoApi } from '../lib/demo'
import type { DemoLinkPublic } from '../lib/demo'
import { Alert, Button, Card, EmptyState, Field, PageHeader } from '../components/ui'
import { IconLock, IconExternal, IconPlus } from '../components/icons'

export function PublicDemoPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [demoInfo, setDemoInfo] = useState<DemoLinkPublic | null>(null)
  const [screens, setScreens] = useState<any[]>([])
  const [password, setPassword] = useState('')
  const [stage, setStage] = useState<'info' | 'password' | 'screens' | 'error'>('info')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const loadDemo = useCallback(async () => {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const info = await demoApi.getPublicDemo(token)
      setDemoInfo(info)
      if (info.password_required) {
        setStage('password')
      } else {
        setStage('screens')
        await loadScreens(token)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo tidak ditemukan')
      setStage('error')
    } finally {
      setBusy(false)
    }
  }, [token])

  const verifyPassword = useCallback(async () => {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const result = await demoApi.verifyDemoPassword(token, password)
      if (result.access_granted) {
        setStage('screens')
        await loadScreens(token, `demo:${token}`)
      } else {
        setError(result.message || 'Verifikasi gagal')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verifikasi gagal')
    } finally {
      setBusy(false)
    }
  }, [token, password])

  const loadScreens = useCallback(async (token: string, demoToken?: string) => {
    try {
      const data = await demoApi.getDemoScreens(token, demoToken)
      setScreens(data || [])
    } catch {
      setError('Gagal memuat layar demo')
    }
  }, [])

  useEffect(() => {
    void loadDemo()
  }, [loadDemo])

  const demoUrl = window.location.origin + window.location.pathname

  return (
    <div>
      <PageHeader
        title={demoInfo?.name ?? 'Demo Publik'}
        description={demoInfo?.description ?? 'Bagikan layar aplikasi tanpa login'}
      />

      {error && (
        <div className="mb-4">
          <Alert tone="danger" title="Gagal">{error}</Alert>
        </div>
      )}

      {stage === 'info' && (
        <div className="text-center py-12">
          <IconLock size={48} className="mx-auto mb-4 text-brand-600" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Demo Publik</h2>
          <p className="text-slate-600 mb-6">{demoInfo?.description ?? ''}</p>
          <p className="text-xs text-slate-400 mb-8">
            Link: <code className="text-brand-600">{demoUrl}</code>
          </p>
          <Button onClick={() => setStage('password')} disabled={busy} loading={busy}>
            <IconPlus size={14} /> Mulai Demo
          </Button>
        </div>
      )}

      {stage === 'password' && (
        <Card title="Verifikasi Password" description="Masukkan sandi untuk membuka demo ini.">
          <Field label="Password" required>
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="button" onClick={() => setShowPassword(!showPassword)} variant="ghost" size="sm">
            {showPassword ? <IconLock size={14} /> : <IconLock size={14} />}
          </Button>
          <div className="mt-4 flex justify-end">
            <Button onClick={verifyPassword} loading={busy}>
              Buka Demo
            </Button>
          </div>
        </Card>
      )}

      {stage === 'screens' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Layar Demo</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{screens.length} layar</span>
              <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
                <IconExternal size={14} /> Kembali
              </Button>
            </div>
          </div>

          {screens.length === 0 ? (
            <EmptyState title="Belum ada layar" description="Pemilik demo belum menambahkan layar ke dalam link ini." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {screens.map((screen) => (
                <Card key={screen.id} title={screen.title} description={screen.source_url}>
                  <div className="aspect-video bg-slate-100 rounded overflow-hidden mb-3">
                    <img
                      src={`/screens/${screen.id}/screenshot?masked=true`}
                      alt={screen.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    v{screen.capture_version} · {screen.category ?? 'Tanpa kategori'}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {stage === 'error' && (
        <div className="text-center py-12">
          <Alert tone="danger" title="Demo tidak tersedia">{error}</Alert>
          <Button onClick={() => navigate(-1)}>Kembali</Button>
        </div>
      )}
    </div>
  )
}
