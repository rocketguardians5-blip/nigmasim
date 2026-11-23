import type { ConfirmOptions } from '../types'
import { Button } from './Button'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  options: ConfirmOptions
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, options, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={options.title}
      description={options.description}
      onClose={onCancel}
      width="sm"
      data-testid="confirm-dialog"
      footer={
        <>
          <Button onClick={onCancel}>{options.cancelLabel ?? 'Batal'}</Button>
          <Button
            variant={options.tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            data-testid="confirm-accept"
          >
            {options.confirmLabel ?? 'Ya, lanjutkan'}
          </Button>
        </>
      }
    />
  )
}
