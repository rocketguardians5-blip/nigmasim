import type { ReactNode } from 'react'
import { ConfirmProvider } from './hooks/useConfirm'
import { ToastProvider } from './hooks/useToast'

/** Provider gabungan: toast + dialog konfirmasi. */
export function SimUIProvider({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  )
}
