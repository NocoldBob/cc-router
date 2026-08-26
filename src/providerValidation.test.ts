import { describe, expect, it } from 'vitest'
import { defaultProviders } from './defaultProviders'
import { providerIsValid } from './providerValidation'

describe('Provider validation', () => {
  it('accepts HTTP endpoints for trusted intranet Provider routes', () => {
    const intranetProvider = {
      ...defaultProviders[0],
      id: 'intranet-yolo',
      displayName: 'Intranet YOLO',
      baseUrl: 'http://192.168.10.24:8000/anthropic',
      authEnvName: 'INTRANET_YOLO_API_KEY',
    }

    expect(providerIsValid(intranetProvider, [intranetProvider])).toBe(true)
  })

  it('rejects unsupported URL protocols', () => {
    const invalidProvider = {
      ...defaultProviders[0],
      id: 'bad-protocol',
      baseUrl: 'ftp://192.168.10.24/anthropic',
    }

    expect(providerIsValid(invalidProvider, [invalidProvider])).toBe(false)
  })
})
