import type { ComponentType } from 'react'
import registryFile from '../registry.json'
import type { RegistryEntry, RegistryFile } from './types'

/**
 * App dimuat secara lazy: `import.meta.glob` tanpa `eager` membuat setiap
 * app menjadi chunk terpisah dan baru diunduh saat dibuka.
 *
 * Menambah simulasi baru = tambah folder `apps/<slug>/index.tsx`
 * + satu entri di `registry.json`. Tidak perlu mengubah file ini.
 */
const appModules = import.meta.glob('../apps/*/index.tsx')

export const registry: RegistryEntry[] = (registryFile as RegistryFile).apps

export function findEntry(slug: string | null): RegistryEntry | undefined {
  if (!slug) return undefined
  return registry.find((entry) => entry.slug === slug)
}

export function appLoader(slug: string): (() => Promise<{ default: ComponentType }>) | undefined {
  const key = `../apps/${slug}/index.tsx`
  const loader = appModules[key]
  if (!loader) return undefined
  return loader as () => Promise<{ default: ComponentType }>
}
