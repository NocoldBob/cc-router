import type { Provider } from './types'

export function providerIsValid(provider: Provider, providers: Provider[]) {
  try {
    const url = new URL(provider.baseUrl)
    const protocolValid = url.protocol === 'https:' || url.protocol === 'http:'
    const effortValid =
      !provider.effortLevel ||
      ['low', 'medium', 'high', 'xhigh', 'max'].includes(provider.effortLevel)
    const contextValueValid = (value: string) => !value || /^[1-9][0-9]*$/.test(value)
    const toggleValid = (value: string) => !value || value === '0' || value === '1'
    return Boolean(
      provider.displayName.trim() &&
        provider.id.match(/^[A-Za-z0-9_-]+$/) &&
        provider.authEnvName.match(/^[A-Z_][A-Z0-9_]*$/) &&
        provider.mainModel.trim() &&
        providers.filter((item) => item.id === provider.id).length === 1 &&
        effortValid &&
        contextValueValid(provider.autoCompactWindow) &&
        contextValueValid(provider.maxContextTokens) &&
        contextValueValid(provider.apiTimeoutMs) &&
        contextValueValid(provider.maxOutputTokens) &&
        toggleValid(provider.disableNonessentialTraffic) &&
        protocolValid,
    )
  } catch {
    return false
  }
}
