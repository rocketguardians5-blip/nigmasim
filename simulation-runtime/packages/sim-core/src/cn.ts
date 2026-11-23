/** Gabungkan className secara kondisional tanpa dependency eksternal. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
