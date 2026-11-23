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

  it('validates the optional extra route variables', () => {
    const glm = defaultProviders.find((provider) => provider.id === 'glm')!
    expect(providerIsValid(glm, [glm])).toBe(true)

    expect(
      providerIsValid({ ...glm, apiTimeoutMs: '0' }, [{ ...glm, apiTimeoutMs: '0' }]),
    ).toBe(false)
    expect(
      providerIsValid({ ...glm, disableNonessentialTraffic: 'yes' }, [glm]),
    ).toBe(false)
    expect(
      providerIsValid({ ...glm, maxOutputTokens: 'abc' }, [glm]),
    ).toBe(false)
  })
})
