import { Badge } from './ui'

type Tone = 'neutral' | 'success' | 'warning' | 'danger'

export const REVIEW_TONE: Record<string, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

/** Badge status otorisasi capture sebuah aplikasi. */
export function AuthorizationBadge({ status }: { status: string }) {
  if (status === 'approved') return <Badge tone="success">Approved</Badge>
  if (status === 'revoked') return <Badge tone="danger">Revoked</Badge>
  return <Badge tone="warning">Pending</Badge>
}

/** Badge status review sebuah screen. */
export function ReviewBadge({ status }: { status: string }) {
  return <Badge tone={REVIEW_TONE[status] ?? 'neutral'}>{status}</Badge>
}
