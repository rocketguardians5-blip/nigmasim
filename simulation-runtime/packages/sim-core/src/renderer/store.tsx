import { createContext, useContext, useState, type ReactNode } from 'react'
import type { StoreApi, UseBoundStore } from 'zustand'
import { createSimStore, type SimStore } from '../store/createSimStore'
import type { SimDataset, SimRecord, SimSeedData } from './types'

export type SimRecordStore = UseBoundStore<StoreApi<SimStore<SimRecord>>>

const SimStoresContext = createContext<Record<string, SimRecordStore> | null>(null)

interface SimStoresProviderProps {
  slug: string
  datasets: SimDataset[]
  seed: SimSeedData
  children: ReactNode
}

/**
 * Satu store per dataset, semuanya di dalam IndexedDB `sim-<slug>`.
 * Store dibuat sekali (useState initializer) supaya hook zustand stabil.
 */
export function SimStoresProvider({
  slug,
  datasets,
  seed,
  children,
}: SimStoresProviderProps) {
  const [stores] = useState<Record<string, SimRecordStore>>(() => {
    const map: Record<string, SimRecordStore> = {}
    for (const dataset of datasets) {
      map[dataset.key] = createSimStore<SimRecord>(slug, seed[dataset.key] ?? [], {
        storageKey: `dataset:${dataset.key}`,
      })
    }
    return map
  })

  return <SimStoresContext.Provider value={stores}>{children}</SimStoresContext.Provider>
}

export function useSimStores(): Record<string, SimRecordStore> {
  const stores = useContext(SimStoresContext)
  if (!stores) throw new Error('useSimStores harus dipakai di dalam <SimStoresProvider>')
  return stores
}

export function useDatasetStore(key: string): SimRecordStore {
  const stores = useSimStores()
  const store = stores[key]
  if (!store) throw new Error(`Dataset "${key}" tidak didefinisikan di definition.ts`)
  return store
}

/** Versi opsional untuk form yang tidak selalu terhubung ke dataset. */
export function useOptionalDatasetStore(key?: string): SimRecordStore | null {
  const stores = useContext(SimStoresContext)
  if (!key) return null
  return stores?.[key] ?? null
}

export function useDatasetRows(key: string): SimRecord[] {
  const store = useDatasetStore(key)
  return store((state) => state.items)
}
