import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { authApi, tokenStore } from './api'
import type { User } from './api'

interface AuthContextValue {
  user: User | null
  permissions: string[]
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  can: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      if (!tokenStore.access) {
        setLoading(false)
        return
      }
      try {
        const me = await authApi.me()
        if (!cancelled) {
          setUser(me.user)
          setPermissions(me.permissions)
        }
      } catch {
        tokenStore.clear()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password)
    tokenStore.save(result.access_token, result.refresh_token)
    setUser(result.user)
    const me = await authApi.me()
    setPermissions(me.permissions)
  }, [])

  const logout = useCallback(async () => {
    const refresh = tokenStore.refresh
    try {
      if (refresh) await authApi.logout(refresh)
    } catch {
      // Token mungkin sudah tidak valid — tetap bersihkan sesi lokal.
    }
    tokenStore.clear()
    setUser(null)
    setPermissions([])
  }, [])

  const can = useCallback(
    (permission: string) =>
      permissions.includes('*') || permissions.includes(permission),
    [permissions],
  )

  const value = useMemo(
    () => ({ user, permissions, loading, login, logout, can }),
    [user, permissions, loading, login, logout, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return context
}
