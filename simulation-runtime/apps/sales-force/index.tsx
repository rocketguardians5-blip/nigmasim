import { useCallback, useEffect, useRef } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SimUIProvider, probeIndexedDb, useSimReset, useToast } from '@sim/core'
import { AppLayout } from './AppLayout'
import { Dashboard } from './pages/Dashboard'
import { CustomerList } from './pages/CustomerList'
import { CustomerForm } from './pages/CustomerForm'
import { CustomerDetail } from './pages/CustomerDetail'
import { useCustomerStore } from './store'

const SLUG = 'sales-force'

function SimShell() {
  const toast = useToast()
  const probed = useRef(false)

  const handleReset = useCallback(() => {
    useCustomerStore.getState().resetToSeed()
    toast('Data simulasi dikembalikan ke seed awal (24 pelanggan).', 'success')
  }, [toast])

  useSimReset({ onReset: handleReset, slug: SLUG })

  useEffect(() => {
    if (probed.current) return
    probed.current = true
    void probeIndexedDb().then((available) => {
      if (!available) {
        toast(
          'Penyimpanan browser (IndexedDB) tidak tersedia. Data hanya bertahan selama tab ini terbuka.',
          'error',
        )
      }
    })
  }, [toast])

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/new" element={<CustomerForm />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="customers/:id/edit" element={<CustomerForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function SalesForceApp() {
  return (
    <SimUIProvider>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SimShell />
      </HashRouter>
    </SimUIProvider>
  )
}
