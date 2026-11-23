import { describe, expect, it } from 'vitest'
import {
  applyProviderPreset,
  defaultProviders,
  findProviderPreset,
  providerMatchesDefaultTemplate,
  providerPresets,
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

  it('keeps every built-in template on its first preset', () => {
    for (const provider of defaultProviders) {
      const presets = providerPresets[provider.id]
      if (!presets?.length) continue
      expect(findProviderPreset(provider)?.id, provider.id).toBe(presets[0].id)
    }
  })

  it('ships verified official endpoints for the built-in templates', () => {
    const byId = new Map(defaultProviders.map((provider) => [provider.id, provider]))

    expect(byId.get('deepseek')?.baseUrl).toBe('https://api.deepseek.com/anthropic')
    expect(byId.get('deepseek')?.mainModel).toBe('deepseek-flash[1m]')
    expect(byId.get('glm')?.baseUrl).toBe('https://open.bigmodel.cn/api/anthropic')
    expect(byId.get('qwen-token-plan')?.baseUrl).toBe(
      'https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic',
    )
    expect(byId.get('qwen-coding-plan')?.baseUrl).toBe(
      'https://coding-intl.dashscope.aliyuncs.com/apps/anthropic',
    )
    expect(byId.get('minimax')?.baseUrl).toBe('https://api.minimax.cn/anthropic')
    expect(byId.get('local-lan')?.baseUrl).toBe('http://192.168.10.24:8000/anthropic')
  })
})

describe('Provider model presets', () => {
  const kimiCode = defaultProviders.find((provider) => provider.id === 'kimi-code')!

  it('defaults Kimi Code to the K3.1 Pro flagship preset', () => {
    expect(kimiCode.mainModel).toBe('k3.1-pro')
    expect(kimiCode.opusModel).toBe('k3.1-pro')
    expect(findProviderPreset(kimiCode)?.id).toBe('k3.1-pro-256k')
  })

  it('switches Kimi Code to the 1M alias atomically', () => {
    const longContext = applyProviderPreset(kimiCode, 'k3.1-pro-1m')
    expect(longContext.mainModel).toBe('k3.1-pro[1m]')
    expect(longContext.haikuModel).toBe('k3.1-pro[1m]')
    expect(longContext.autoCompactWindow).toBe('1048576')
    expect(findProviderPreset(longContext)?.id).toBe('k3.1-pro-1m')
  })

  it('applies the quota-saving K2.7 Code model to every Claude role', () => {
    const economical = applyProviderPreset(kimiCode, 'k2.7-code')
    expect(economical.mainModel).toBe('kimi-for-coding')
    expect(economical.fastModel).toBe('kimi-for-coding')
    expect(economical.opusModel).toBe('kimi-for-coding')
    expect(economical.sonnetModel).toBe('kimi-for-coding')
    expect(economical.haikuModel).toBe('kimi-for-coding')
    expect(economical.fableModel).toBe('kimi-for-coding')
    expect(economical.subagentModel).toBe('kimi-for-coding')
    expect(economical.maxContextTokens).toBe('262144')
    expect(findProviderPreset(economical)?.id).toBe('k2.7-code')
  })

  it('still recognizes a preset after the user edits only its notes', () => {
    expect(findProviderPreset({ ...kimiCode, notes: 'My note' })?.id).toBe('k3.1-pro-256k')
  })

  it('switches GLM between Coding Plan and flagship presets with extra variables', () => {
    const glm = defaultProviders.find((provider) => provider.id === 'glm')!
    expect(findProviderPreset(glm)?.id).toBe('glm-5.2-coding-plan')
    expect(glm.apiTimeoutMs).toBe('3000000')
    expect(glm.disableNonessentialTraffic).toBe('1')

    const flagship = applyProviderPreset(glm, 'glm-5.3')
    expect(flagship.mainModel).toBe('glm-5.3')
    expect(flagship.haikuModel).toBe('glm-4.7')
    expect(flagship.apiTimeoutMs).toBe('3000000')
    expect(findProviderPreset(flagship)?.id).toBe('glm-5.3')
  })

  it('switches DeepSeek between the official flash route and the quality route', () => {
    const deepseek = defaultProviders.find((provider) => provider.id === 'deepseek')!
    expect(findProviderPreset(deepseek)?.id).toBe('flash-1m')

    const pro = applyProviderPreset(deepseek, 'pro-1m')
    expect(pro.mainModel).toBe('deepseek-v4-pro[1m]')
    expect(pro.haikuModel).toBe('deepseek-flash')
    expect(findProviderPreset(pro)?.id).toBe('pro-1m')
  })
})
