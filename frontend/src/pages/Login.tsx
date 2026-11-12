import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import { Alert, Button, Field } from '../components/ui'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tidak dapat menghubungi server')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r border-slate-200 bg-ink-900 p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <img
            src="/brand/nigmagrid-logo.png"
            alt="Logo PT Nigmagrid Indo Nesia"
            className="h-8 w-8"
          />
          <div>
            <p className="text-[13px] font-semibold leading-tight text-white">NigmaSim</p>
            <p className="text-[11px] leading-tight text-slate-500">PT Nigmagrid Indo Nesia</p>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-xl font-semibold leading-snug text-white">
            Simulasi aplikasi yang aman untuk demo, pelatihan, dan dokumentasi.
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-400">
            NigmaSim merekonstruksi tampilan aplikasi yang telah diotorisasi menjadi simulasi
            interaktif dengan data dummy — tanpa pernah menyentuh database atau API produksi.
          </p>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-600">
          Akses hanya untuk pengguna terdaftar. Seluruh aktivitas dicatat dalam audit log.
        </p>
      </div>

      <div className="flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <img
              src="/brand/nigmagrid-logo.png"
              alt="Logo PT Nigmagrid Indo Nesia"
              className="mb-3 h-8 w-8"
            />
            <p className="text-[13px] font-semibold text-slate-900">NigmaSim</p>
            <p className="text-[11px] text-slate-500">PT Nigmagrid Indo Nesia</p>
          </div>

          <h2 className="text-lg font-semibold text-slate-900">Masuk ke NigmaSim</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">Gunakan akun internal yang terdaftar.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && <Alert tone="danger">{error}</Alert>}

            <Field label="Email" required>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="nama@nigmagrid.com"
                required
              />
            </Field>

            <Field label="Password" required>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </Field>

            <Button type="submit" className="w-full" loading={submitting}>
              {submitting ? 'Memproses…' : 'Masuk'}
            </Button>
          </form>

          <p className="mt-6 text-[11px] text-slate-400">
            NigmaSim tidak pernah menyimpan kredensial aplikasi sumber.
          </p>
        </div>
      </div>
    </div>
  )
}
