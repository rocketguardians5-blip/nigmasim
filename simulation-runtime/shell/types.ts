export interface RegistryEntry {
  slug: string
  name: string
  icon: string
  description: string
  path: string
  accent?: string
}

export interface RegistryFile {
  apps: RegistryEntry[]
}
