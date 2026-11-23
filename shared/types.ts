export type ProviderAccent = 'green' | 'blue' | 'orange' | 'violet'

export interface Provider {
  id: string
  displayName: string
  baseUrl: string
  authEnvName: string
  mainModel: string
  fastModel: string
  opusModel: string
  sonnetModel: string
  haikuModel: string
  fableModel: string
  subagentModel: string
  effortLevel: string
  autoCompactWindow: string
  maxContextTokens: string
  apiTimeoutMs: string
  disableNonessentialTraffic: string
  maxOutputTokens: string
  notes: string
  enabled: boolean
  accent: ProviderAccent
}

export type OutputMode = 'session' | 'persistent' | 'settings' | 'clear'
