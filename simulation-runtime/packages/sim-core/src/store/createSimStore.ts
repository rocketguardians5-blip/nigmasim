import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { BaseRecord } from '../types'
import { createIdbStorage, STORAGE_KEY, STORAGE_VERSION } from './idbStorage'

export interface SimStore<T extends BaseRecord> {
  items: T[]
  /** True setelah proses hidrasi dari IndexedDB selesai (atau gagal). */
  hydrated: boolean
  get: (id: string) => T | undefined
  add: (draft: Omit<T, 'id'>) => T
  update: (id: string, patch: Partial<Omit<T, 'id'>>) => void
  remove: (id: string) => void
  resetToSeed: () => void
  markHydrated: () => void
}

let fallbackCounter = 0

/** ID unik; memakai crypto.randomUUID bila tersedia. */
export function createId(): string {
  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  fallbackCounter += 1
  return `id-${Date.now().toString(36)}-${fallbackCounter}`
}

function cloneSeed<T>(factory: () => T[]): T[] {
  // Seed harus selalu berupa objek baru supaya mutasi di UI tidak
  // "mencemari" seed asli saat reset berikutnya.
  return JSON.parse(JSON.stringify(factory())) as T[]
}

/**
 * Membuat store simulasi dengan persistensi IndexedDB `sim-<slug>`.
 *
 * - `resetToSeed()` mengembalikan seluruh data ke seed awal.
 * - Versi storage tidak cocok => data lama dibuang, app kembali ke seed.
 * - Bila IndexedDB tidak tersedia, state tetap hidup di memori.
 */
export interface CreateSimStoreOptions {
  /**
   * Nama entri di dalam IndexedDB. Wajib unik bila satu app punya beberapa
   * dataset. Default memakai STORAGE_KEY (satu dataset per app).
   */
  storageKey?: string
}

export function createSimStore<T extends BaseRecord>(
  slug: string,
  seed: T[] | (() => T[]),
  options: CreateSimStoreOptions = {},
) {
  const seedFactory: () => T[] = typeof seed === 'function' ? seed : () => seed
  const storageKey = options.storageKey ?? STORAGE_KEY

  return create<SimStore<T>>()(
    persist<SimStore<T>, [], [], Pick<SimStore<T>, 'items'>>(
      (set, get) => ({
        items: cloneSeed(seedFactory),
        hydrated: false,

        get: (id) => get().items.find((item) => item.id === id),

        add: (draft) => {
          const record = { ...draft, id: createId() } as T
          set((state) => ({ items: [record, ...state.items] }))
          return record
        },

        update: (id, patch) =>
          set((state) => ({
            items: state.items.map((item) =>
              item.id === id ? ({ ...item, ...patch, id } as T) : item,
            ),
          })),

        remove: (id) =>
          set((state) => ({ items: state.items.filter((item) => item.id !== id) })),

        resetToSeed: () => set({ items: cloneSeed(seedFactory) }),

        markHydrated: () => set({ hydrated: true }),
      }),
      {
        name: storageKey,
        version: STORAGE_VERSION,
        storage: createJSONStorage(() => createIdbStorage(slug)),
        partialize: (state) => ({ items: state.items }),
        onRehydrateStorage: () => (state) => {
          state?.markHydrated()
        },
        migrate: (persisted, version) => {
          if (version !== STORAGE_VERSION) {
            return { items: cloneSeed(seedFactory) }
          }
          return persisted as Pick<SimStore<T>, 'items'>
        },
      },
    ),
  )
}
