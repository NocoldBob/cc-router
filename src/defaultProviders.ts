import type { Provider } from './types'

export type KimiCodePresetId = 'k3-1m' | 'k3-256k' | 'k2.7-code'

type KimiCodePresetFields = Pick<
  Provider,
  | 'mainModel'
  | 'fastModel'
  | 'opusModel'
  | 'sonnetModel'
  | 'haikuModel'
  | 'fableModel'
  | 'subagentModel'
  | 'effortLevel'
  | 'autoCompactWindow'
  | 'maxContextTokens'
  | 'notes'
>

export interface KimiCodePreset {
  id: KimiCodePresetId
  label: string
  description: string
  fields: KimiCodePresetFields
}

const allKimiModels = (model: string) => ({
  mainModel: model,
  fastModel: model,
  opusModel: model,
  sonnetModel: model,
  haikuModel: model,
  fableModel: model,
  subagentModel: model,
})

export const kimiCodePresets: KimiCodePreset[] = [
  {
    id: 'k3-1m',
    label: 'K3 1M · 复杂任务',
    description: '主会话使用 K3 1M，快速与 Haiku 路由使用 K3 256K。',
    fields: {
      mainModel: 'k3[1m]',
      fastModel: 'k3-256k',
      opusModel: 'k3[1m]',
      sonnetModel: 'k3[1m]',
      haikuModel: 'k3-256k',
      fableModel: 'k3[1m]',
      subagentModel: 'k3[1m]',
      effortLevel: 'high',
      autoCompactWindow: '1048576',
      maxContextTokens: '1048576',
      notes: 'Kimi K3 1M for complex tasks. Uses more membership quota.',
    },
  },
  {
    id: 'k3-256k',
    label: 'K3 256K · 日常推荐',
    description: '256K 内保持 K3 能力，官方说明消耗约为 1M 版本的一半。',
    fields: {
      ...allKimiModels('k3-256k'),
      effortLevel: 'high',
      autoCompactWindow: '262144',
      maxContextTokens: '262144',
      notes: 'Kimi K3 256K for everyday coding with lower quota usage.',
    },
  },
  {
    id: 'k2.7-code',
    label: 'K2.7 Code · 省额度',
    description: '适合代码补全、常规开发和额度不足时继续工作。',
    fields: {
      ...allKimiModels('kimi-for-coding'),
      effortLevel: 'high',
      autoCompactWindow: '262144',
      maxContextTokens: '262144',
      notes: 'Kimi K2.7 Code quota-saving route for routine development.',
    },
  },
]

export function applyKimiCodePreset(
  provider: Provider,
  presetId: KimiCodePresetId,
): Provider {
  const preset = kimiCodePresets.find((candidate) => candidate.id === presetId)
  if (!preset) return provider
  return { ...provider, ...preset.fields }
}

export function findKimiCodePreset(provider: Provider): KimiCodePreset | undefined {
  const matchingFields: Array<keyof Omit<KimiCodePresetFields, 'notes'>> = [
    'mainModel',
    'fastModel',
    'opusModel',
    'sonnetModel',
    'haikuModel',
    'fableModel',
    'subagentModel',
    'effortLevel',
    'autoCompactWindow',
    'maxContextTokens',
  ]
  return kimiCodePresets.find((preset) =>
    matchingFields.every((field) => provider[field] === preset.fields[field]),
  )
}

export const defaultProviders: Provider[] = [
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    authEnvName: 'DEEPSEEK_API_KEY',
    mainModel: 'deepseek-v4-pro[1m]',
    fastModel: 'deepseek-v4-flash',
    opusModel: 'deepseek-v4-pro[1m]',
    sonnetModel: 'deepseek-v4-pro[1m]',
    haikuModel: 'deepseek-v4-flash',
    fableModel: 'deepseek-v4-pro[1m]',
    subagentModel: 'deepseek-v4-flash',
    effortLevel: 'max',
    autoCompactWindow: '',
    maxContextTokens: '',
    notes: 'Anthropic-compatible endpoint for Claude Code.',
    enabled: true,
    accent: 'green',
  },
  {
    id: 'kimi-global',
    displayName: 'Kimi Global',
    baseUrl: 'https://api.moonshot.ai/anthropic',
    authEnvName: 'KIMI_API_KEY',
    mainModel: 'kimi-k3',
    fastModel: 'kimi-k2.6',
    opusModel: 'kimi-k3',
    sonnetModel: 'kimi-k3',
    haikuModel: 'kimi-k2.6',
    fableModel: 'kimi-k3',
    subagentModel: 'kimi-k3',
    effortLevel: 'high',
    autoCompactWindow: '262144',
    maxContextTokens: '262144',
    notes: 'Moonshot global Anthropic-compatible endpoint.',
    enabled: true,
    accent: 'blue',
  },
  {
    id: 'kimi-code',
    displayName: 'Kimi Code',
    baseUrl: 'https://api.kimi.com/coding/',
    authEnvName: 'KIMI_API_KEY',
    mainModel: 'k3[1m]',
    fastModel: 'k3-256k',
    opusModel: 'k3[1m]',
    sonnetModel: 'k3[1m]',
    haikuModel: 'k3-256k',
    fableModel: 'k3[1m]',
    subagentModel: 'k3[1m]',
    effortLevel: 'high',
    autoCompactWindow: '1048576',
    maxContextTokens: '1048576',
    notes: 'Kimi K3 1M for complex tasks. Uses more membership quota.',
    enabled: true,
    accent: 'orange',
  },
]

export interface ProviderTemplateMetadata {
  verifiedAt: string
  documentationUrl: string
}

export const providerTemplateMetadata: Record<string, ProviderTemplateMetadata> = {
  deepseek: {
    verifiedAt: '2026-08-19',
    documentationUrl: 'https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code',
  },
  'kimi-global': {
    verifiedAt: '2026-08-19',
    documentationUrl: 'https://platform.kimi.ai/docs/models',
  },
  'kimi-code': {
    verifiedAt: '2026-09-07',
    documentationUrl: 'https://www.kimi.com/code/docs/third-party-tools/claude-code.html',
  },
}

const templateFields: Array<keyof Provider> = [
  'id',
  'baseUrl',
  'authEnvName',
  'mainModel',
  'fastModel',
  'opusModel',
  'sonnetModel',
  'haikuModel',
  'fableModel',
  'subagentModel',
  'effortLevel',
  'autoCompactWindow',
  'maxContextTokens',
]

export function providerMatchesDefaultTemplate(provider: Provider) {
  const template = defaultProviders.find((candidate) => candidate.id === provider.id)
  return Boolean(template && templateFields.every((field) => provider[field] === template[field]))
}
