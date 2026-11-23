import { SimApp } from '@sim/core'
import { definition } from './definition'
import { seed } from './seed'

export default function GeneratedSimulation() {
  return <SimApp definition={definition} seed={seed} slug="demo-client-api-nigma" />
}
