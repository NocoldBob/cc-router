import { describe, expect, it } from 'vitest'
import {
  applyKimiCodePreset,
  defaultProviders,
  findKimiCodePreset,
  providerMatchesDefaultTemplate,
} from './defaultProviders'

describe('built-in Provider template metadata', () => {
  it('only treats unchanged built-in route values as verified', () => {
    expect(providerMatchesDefaultTemplate(defaultProviders[0])).toBe(true)
    expect(
      providerMatchesDefaultTemplate({
        ...defaultProviders[0],
        mainModel: 'locally-edited-model',
      }),
    ).toBe(false)
    expect(
      providerMatchesDefaultTemplate({
        ...defaultProviders[0],
        id: 'custom-provider',
      }),
    ).toBe(false)
  })
})

describe('Kimi Code model presets', () => {
  const kimiCode = defaultProviders.find((provider) => provider.id === 'kimi-code')!

  it('keeps the Claude Code-specific 1M model alias in the built-in template', () => {
    expect(kimiCode.mainModel).toBe('k3[1m]')
    expect(kimiCode.opusModel).toBe('k3[1m]')
    expect(findKimiCodePreset(kimiCode)?.id).toBe('k3-1m')
  })

  it('applies the quota-saving K2.7 Code model to every Claude role', () => {
    const economical = applyKimiCodePreset(kimiCode, 'k2.7-code')
    expect(economical.mainModel).toBe('kimi-for-coding')
    expect(economical.fastModel).toBe('kimi-for-coding')
    expect(economical.opusModel).toBe('kimi-for-coding')
    expect(economical.sonnetModel).toBe('kimi-for-coding')
    expect(economical.haikuModel).toBe('kimi-for-coding')
    expect(economical.fableModel).toBe('kimi-for-coding')
    expect(economical.subagentModel).toBe('kimi-for-coding')
    expect(economical.maxContextTokens).toBe('262144')
    expect(findKimiCodePreset(economical)?.id).toBe('k2.7-code')
  })

  it('still recognizes a preset after the user edits only its notes', () => {
    expect(findKimiCodePreset({ ...kimiCode, notes: 'My note' })?.id).toBe('k3-1m')
  })
})
