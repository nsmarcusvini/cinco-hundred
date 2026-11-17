import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureUtm, utmMetadata } from './utm'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
})
const visit = (search: string) => {
  vi.stubGlobal('location', { search })
  captureUtm()
}

describe('utm', () => {
  beforeEach(() => store.clear())

  it('envia no cadastro a origem da primeira visita', () => {
    visit('?utm_source=instagram&utm_campaign=organico')
    expect(utmMetadata()).toEqual({ utm_source: 'instagram', utm_campaign: 'organico' })
  })

  it('uma visita posterior não sobrescreve a primeira origem', () => {
    visit('?utm_source=instagram&utm_campaign=bio')
    visit('?utm_source=google')
    expect(utmMetadata()).toEqual({ utm_source: 'instagram', utm_campaign: 'bio' })
  })

  it('sem UTM o cadastro segue sem origem', () => {
    visit('')
    expect(utmMetadata()).toEqual({})
  })
})
