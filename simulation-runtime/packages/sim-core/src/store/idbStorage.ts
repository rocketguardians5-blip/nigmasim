import { createStore, del, get, set } from 'idb-keyval'
import type { StateStorage } from 'zustand/middleware'

/**
 * Naikkan angka ini bila bentuk data berubah. Data lama dengan versi berbeda
 * akan dihapus dan app kembali ke seed (bukan crash / data setengah valid).
 */
export const STORAGE_VERSION = 1
export const STORAGE_KEY = 'sim-store-v1'

interface StoredEnvelope {
  v: number
  raw: string
}

/**
 * Satu database IndexedDB per app: `sim-<slug>`.
 * Catatan keamanan: semua app masih berbagi satu origin, jadi isolasi
 * IndexedDB belum mutlak (lihat README runtime).
 */
export function createIdbStorage(slug: string): StateStorage {
  const store = createStore(`sim-${slug}`, 'kv')

  return {
    getItem: async (name) => {
      try {
        const raw = await get<string>(name, store)
        if (typeof raw !== 'string') return null
        const parsed = JSON.parse(raw) as StoredEnvelope
        if (!parsed || parsed.v !== STORAGE_VERSION || typeof parsed.raw !== 'string') {
          await del(name, store)
          return null
        }
        return parsed.raw
      } catch {
        return null
      }
    },
    setItem: async (name, value) => {
      try {
        const envelope: StoredEnvelope = { v: STORAGE_VERSION, raw: value }
        await set(name, JSON.stringify(envelope), store)
      } catch {
        // IndexedDB tidak tersedia: state tetap hidup di memori.
      }
    },
    removeItem: async (name) => {
      try {
        await del(name, store)
      } catch {
        // abaikan
      }
    },
  }
}

/** Cek apakah IndexedDB benar-benar bisa ditulis (mode privat bisa memblokir). */
export async function probeIndexedDb(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined') return false
    const store = createStore('sim-probe', 'kv')
    await set('probe', '1', store)
    await del('probe', store)
    return true
  } catch {
    return false
  }
}
