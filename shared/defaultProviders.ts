import type { Provider } from './types'

export type PresetFields = Pick<
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
  | 'apiTimeoutMs'
  | 'disableNonessentialTraffic'
  | 'maxOutputTokens'
  | 'notes'
>

export interface ProviderPreset {
  id: string
  label: string
  description: string
  fields: PresetFields
}

const VERIFIED_AT = '2026-11-23'

const allModels = (model: string) => ({
  mainModel: model,
  fastModel: model,
  opusModel: model,
  sonnetModel: model,
  haikuModel: model,
  fableModel: model,
  subagentModel: model,
})

const noExtraVariables = {
  apiTimeoutMs: '',
  disableNonessentialTraffic: '',
  maxOutputTokens: '',
}

const glmExtraVariables = {
  apiTimeoutMs: '3000000',
  disableNonessentialTraffic: '1',
  maxOutputTokens: '',
}

const deepseekFlashFields: PresetFields = {
  mainModel: 'deepseek-flash[1m]',
  fastModel: 'deepseek-flash',
  opusModel: 'deepseek-flash[1m]',
  sonnetModel: 'deepseek-flash[1m]',
  haikuModel: 'deepseek-flash',
  fableModel: 'deepseek-flash[1m]',
  subagentModel: 'deepseek-flash',
  effortLevel: 'max',
  autoCompactWindow: '786432',
  maxContextTokens: '',
  ...noExtraVariables,
  notes:
    'Official Claude Code configuration: deepseek-flash[1m] across roles. The legacy deepseek-v4-flash name is now an alias served by DeepSeek-V4.1-Flash.',
}

const deepseekProFields: PresetFields = {
  mainModel: 'deepseek-v4-pro[1m]',
  fastModel: 'deepseek-flash',
  opusModel: 'deepseek-v4-pro[1m]',
  sonnetModel: 'deepseek-v4-pro[1m]',
  haikuModel: 'deepseek-flash',
  fableModel: 'deepseek-v4-pro[1m]',
  subagentModel: 'deepseek-flash',
  effortLevel: 'max',
  autoCompactWindow: '786432',
  maxContextTokens: '',
  ...noExtraVariables,
  notes:
    'Quality-first route: main roles use deepseek-v4-pro[1m], background roles use deepseek-flash to control cost.',
}

const kimiGlobal1mFields: PresetFields = {
  ...allModels('kimi-k3[1m]'),
  effortLevel: 'max',
  autoCompactWindow: '1000000',
  maxContextTokens: '',
  ...noExtraVariables,
  notes:
    'Moonshot global platform (api.moonshot.ai): kimi-k3[1m] for every Claude Code role. Keys are not interchangeable with the China platform at api.moonshot.cn/anthropic.',
}

const kimiCodeK31Pro256kFields: PresetFields = {
  ...allModels('k3.1-pro'),
  effortLevel: 'high',
  autoCompactWindow: '262144',
  maxContextTokens: '262144',
  ...noExtraVariables,
  notes:
    'Kimi K3.1 Pro flagship preset (256K). K3.1 Pro is thinking-only; 1M context and Highspeed require the Pro tier or above.',
}

export const providerPresets: Record<string, ProviderPreset[]> = {
  deepseek: [
    {
      id: 'flash-1m',
      label: 'V4.1 Flash 1M · 官方推荐',
      description: '官方 Claude Code 配置：全档位 deepseek-flash[1m]，速度优先、成本最低。',
      fields: deepseekFlashFields,
    },
    {
      id: 'pro-1m',
      label: 'V4 Pro 1M · 质量优先',
      description: '主对话与重任务走 deepseek-v4-pro[1m]，后台与小模型角色走 deepseek-flash 控制成本。',
      fields: deepseekProFields,
    },
  ],
  'kimi-global': [
    {
      id: 'k3-1m',
      label: 'K3 1M · 官方推荐',
      description: '官方示例：全档位 kimi-k3[1m]，1M 上下文，思考强度 max。',
      fields: kimiGlobal1mFields,
    },
    {
      id: 'k3-256k',
      label: 'K3 256K · 省额度',
      description: '全档位 kimi-k3（256K），上下文窗口相应收紧，额度消耗更低。',
      fields: {
        ...allModels('kimi-k3'),
        effortLevel: 'high',
        autoCompactWindow: '262144',
        maxContextTokens: '',
        ...noExtraVariables,
        notes: 'Moonshot global platform: kimi-k3 (256K) for every role to reduce quota usage.',
      },
    },
    {
      id: 'k3.1-pro',
      label: 'K3.1 Pro · 新旗舰',
      description: '全档位 kimi-k3.1-pro。可用上下文上限取决于账户档位，默认按 256K 配置。',
      fields: {
        ...allModels('kimi-k3.1-pro'),
        effortLevel: 'max',
        autoCompactWindow: '262144',
        maxContextTokens: '',
        ...noExtraVariables,
        notes: 'Moonshot global platform: kimi-k3.1-pro flagship for every role (256K window).',
      },
    },
  ],
  'kimi-code': [
    {
      id: 'k3.1-pro-256k',
      label: 'K3.1 Pro 256K · 新旗舰（Plus 及以上）',
      description: 'K3.1 Pro 仅支持思考模式；Plus 档位的上下文上限为 256K。',
      fields: kimiCodeK31Pro256kFields,
    },
    {
      id: 'k3.1-pro-1m',
      label: 'K3.1 Pro 1M · 长上下文（Pro 及以上）',
      description: '使用 k3.1-pro[1m] 别名开启 1M 上下文，消耗更多会员额度。',
      fields: {
        ...allModels('k3.1-pro[1m]'),
        effortLevel: 'high',
        autoCompactWindow: '1048576',
        maxContextTokens: '1048576',
        ...noExtraVariables,
        notes: 'Kimi K3.1 Pro with the 1M context alias. Requires the Pro tier or above.',
      },
    },
    {
      id: 'k3.1-pro-highspeed',
      label: 'K3.1 Pro Highspeed 1M · 快速旗舰（Pro 及以上）',
      description: '相同效果下速度约为 K3.1 Pro 的 2–3 倍，适合高频交互。',
      fields: {
        ...allModels('k3.1-pro-highspeed'),
        effortLevel: 'high',
        autoCompactWindow: '1048576',
        maxContextTokens: '1048576',
        ...noExtraVariables,
        notes: 'Kimi K3.1 Pro Highspeed, 2-3x faster at the same quality. Requires Pro tier or above.',
      },
    },
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
        ...noExtraVariables,
        notes: 'Kimi K3 1M for complex tasks. Uses more membership quota.',
      },
    },
    {
      id: 'k3-256k',
      label: 'K3 256K · 日常推荐',
      description: '256K 内保持 K3 能力，官方说明消耗约为 1M 版本的一半。',
      fields: {
        ...allModels('k3-256k'),
        effortLevel: 'high',
        autoCompactWindow: '262144',
        maxContextTokens: '262144',
        ...noExtraVariables,
        notes: 'Kimi K3 256K for everyday coding with lower quota usage.',
      },
    },
    {
      id: 'k2.7-code',
      label: 'K2.7 Code · 省额度',
      description: '适合代码补全、常规开发和额度不足时继续工作。',
      fields: {
        ...allModels('kimi-for-coding'),
        effortLevel: 'high',
        autoCompactWindow: '262144',
        maxContextTokens: '262144',
        ...noExtraVariables,
        notes: 'Kimi K2.7 Code quota-saving route for routine development.',
      },
    },
  ],
  glm: [
    {
      id: 'glm-5.2-coding-plan',
      label: 'GLM-5.2 1M · Coding Plan 官方推荐',
      description: '官方 Claude Code 配置：主档位 glm-5.2[1m]，Haiku/后台 glm-4.7。',
      fields: {
        mainModel: 'glm-5.2[1m]',
        fastModel: 'glm-4.7',
        opusModel: 'glm-5.2[1m]',
        sonnetModel: 'glm-5.2[1m]',
        haikuModel: 'glm-4.7',
        fableModel: 'glm-5.2[1m]',
        subagentModel: 'glm-4.7',
        effortLevel: 'max',
        autoCompactWindow: '1000000',
        maxContextTokens: '',
        ...glmExtraVariables,
        notes: 'Zhipu GLM Coding Plan: glm-5.2[1m] for main roles, glm-4.7 for background.',
      },
    },
    {
      id: 'glm-5.3',
      label: 'GLM-5.3 旗舰 · 标准 API',
      description: '最新旗舰 GLM-5.3（强制思考）。Coding Plan 订阅用户暂只能经 OpenAI 协议调用 5.3。',
      fields: {
        mainModel: 'glm-5.3',
        fastModel: 'glm-4.7',
        opusModel: 'glm-5.3',
        sonnetModel: 'glm-5.3',
        haikuModel: 'glm-4.7',
        fableModel: 'glm-5.3',
        subagentModel: 'glm-4.7',
        effortLevel: 'max',
        autoCompactWindow: '1000000',
        maxContextTokens: '',
        ...glmExtraVariables,
        notes:
          'GLM-5.3 flagship (1M context, always-on thinking). Coding Plan keys can only call it via the OpenAI protocol for now.',
      },
    },
  ],
  'qwen-token-plan': [
    {
      id: 'token-plan-default',
      label: 'auto 路由 · 官方推荐',
      description: '主模型 auto，Opus 档 qwen4-max-preview，轻量档 qwen3.6/3.8-flash。',
      fields: {
        mainModel: 'auto',
        fastModel: 'qwen3.6-flash',
        opusModel: 'qwen4-max-preview',
        sonnetModel: 'qwen3.8-flash',
        haikuModel: 'qwen3.6-flash',
        fableModel: 'auto',
        subagentModel: 'auto',
        effortLevel: '',
        autoCompactWindow: '',
        maxContextTokens: '983616',
        apiTimeoutMs: '',
        disableNonessentialTraffic: '',
        maxOutputTokens: '64000',
        notes: 'Model Studio Token Plan with auto main routing. 64000 max output avoids qwen4-max-preview truncation.',
      },
    },
    {
      id: 'qwen4-max',
      label: 'qwen4-max · 质量优先',
      description: 'Opus 档改用 qwen4-max，最大输出提高到 131072。',
      fields: {
        mainModel: 'auto',
        fastModel: 'qwen3.6-flash',
        opusModel: 'qwen4-max',
        sonnetModel: 'qwen3.8-flash',
        haikuModel: 'qwen3.6-flash',
        fableModel: 'auto',
        subagentModel: 'auto',
        effortLevel: '',
        autoCompactWindow: '',
        maxContextTokens: '983616',
        apiTimeoutMs: '',
        disableNonessentialTraffic: '',
        maxOutputTokens: '131072',
        notes: 'Token Plan with qwen4-max on the Opus role and the full 131072 output budget.',
      },
    },
  ],
  'qwen-coding-plan': [
    {
      id: 'qwen3.7-plus',
      label: 'Qwen3.7 Plus · 官方默认',
      description: '官方配置：全档位 qwen3.7-plus。',
      fields: {
        ...allModels('qwen3.7-plus'),
        effortLevel: '',
        autoCompactWindow: '',
        maxContextTokens: '',
        ...noExtraVariables,
        notes: 'Model Studio Coding Plan: qwen3.7-plus for every Claude Code role.',
      },
    },
    {
      id: 'qwen3.8-max',
      label: 'Qwen3.8 Max · 质量优先',
      description: '主对话与 Opus 档 qwen3.8-max，轻量档 qwen3.8-flash。',
      fields: {
        mainModel: 'qwen3.8-max',
        fastModel: 'qwen3.8-flash',
        opusModel: 'qwen3.8-max',
        sonnetModel: 'qwen3.8-flash',
        haikuModel: 'qwen3.8-flash',
        fableModel: 'qwen3.8-max',
        subagentModel: 'qwen3.8-flash',
        effortLevel: '',
        autoCompactWindow: '',
        maxContextTokens: '',
        ...noExtraVariables,
        notes: 'Coding Plan quality route: qwen3.8-max main roles, qwen3.8-flash background.',
      },
    },
  ],
  minimax: [
    {
      id: 'm3.1-flash',
      label: 'M3.1 Flash 1M · 官方推荐',
      description: '官方配置：全档位 MiniMax-M3.1-Flash[1m]，512K 自动压缩窗口。',
      fields: {
        ...allModels('MiniMax-M3.1-Flash[1m]'),
        effortLevel: 'max',
        autoCompactWindow: '524288',
        maxContextTokens: '',
        ...noExtraVariables,
        notes: 'MiniMax M Plan: MiniMax-M3.1-Flash[1m] for every role with a 512K compaction window.',
      },
    },
  ],
}

export function applyProviderPreset(provider: Provider, presetId: string): Provider {
  const preset = providerPresets[provider.id]?.find((candidate) => candidate.id === presetId)
  if (!preset) return provider
  return { ...provider, ...preset.fields }
}

export function findProviderPreset(provider: Provider): ProviderPreset | undefined {
  const matchingFields: Array<keyof Omit<PresetFields, 'notes'>> = [
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
    'apiTimeoutMs',
    'disableNonessentialTraffic',
    'maxOutputTokens',
  ]
  return providerPresets[provider.id]?.find((preset) =>
    matchingFields.every((field) => provider[field] === preset.fields[field]),
  )
}

export const defaultProviders: Provider[] = [
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    authEnvName: 'DEEPSEEK_API_KEY',
    ...deepseekFlashFields,
    enabled: true,
    accent: 'green',
  },
  {
    id: 'kimi-global',
    displayName: 'Kimi Global',
    baseUrl: 'https://api.moonshot.ai/anthropic',
    authEnvName: 'KIMI_API_KEY',
    ...kimiGlobal1mFields,
    enabled: true,
    accent: 'blue',
  },
  {
    id: 'kimi-code',
    displayName: 'Kimi Code',
    baseUrl: 'https://api.kimi.com/coding/',
    authEnvName: 'KIMI_API_KEY',
    ...kimiCodeK31Pro256kFields,
    enabled: true,
    accent: 'orange',
  },
  {
    id: 'glm',
    displayName: 'GLM 智谱',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    authEnvName: 'GLM_API_KEY',
    ...providerPresets.glm[0].fields,
    enabled: true,
    accent: 'violet',
  },
  {
    id: 'qwen-token-plan',
    displayName: 'Qwen Token Plan',
    baseUrl: 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic',
    authEnvName: 'DASHSCOPE_API_KEY',
    ...providerPresets['qwen-token-plan'][0].fields,
    enabled: true,
    accent: 'green',
  },
  {
    id: 'qwen-coding-plan',
    displayName: 'Qwen Coding Plan',
    baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/apps/anthropic',
    authEnvName: 'DASHSCOPE_API_KEY',
    ...providerPresets['qwen-coding-plan'][0].fields,
    enabled: true,
    accent: 'blue',
  },
  {
    id: 'minimax',
    displayName: 'MiniMax',
    baseUrl: 'https://api.minimax.cn/anthropic',
    authEnvName: 'MINIMAX_API_KEY',
    ...providerPresets.minimax[0].fields,
    enabled: true,
    accent: 'orange',
  },
  {
    id: 'local-lan',
    displayName: '本地 / 局域网部署',
    baseUrl: 'http://192.168.10.24:8000/anthropic',
    authEnvName: 'LOCAL_API_KEY',
    mainModel: 'deepseek-v4-pro',
    fastModel: 'deepseek-flash',
    opusModel: '',
    sonnetModel: '',
    haikuModel: '',
    fableModel: '',
    subagentModel: '',
    effortLevel: '',
    autoCompactWindow: '',
    maxContextTokens: '',
    ...noExtraVariables,
    notes:
      '局域网占位地址，请按实际部署修改。多数本地推理框架仅提供 OpenAI 协议，需经 LiteLLM 等网关转换为 Anthropic Messages 协议后填入对应地址与模型名。',
    enabled: true,
    accent: 'violet',
  },
]

export interface ProviderTemplateMetadata {
  verifiedAt: string
  documentationUrl: string
}

export const providerTemplateMetadata: Record<string, ProviderTemplateMetadata> = {
  deepseek: {
    verifiedAt: VERIFIED_AT,
    documentationUrl: 'https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code',
  },
  'kimi-global': {
    verifiedAt: VERIFIED_AT,
    documentationUrl: 'https://platform.kimi.com/docs/guide/claude-code-kimi',
  },
  'kimi-code': {
    verifiedAt: VERIFIED_AT,
    documentationUrl: 'https://www.kimi.com/code/docs/third-party-tools/claude-code.html',
  },
  glm: {
    verifiedAt: VERIFIED_AT,
    documentationUrl: 'https://docs.bigmodel.cn/cn/guide/develop/claude',
  },
  'qwen-token-plan': {
    verifiedAt: VERIFIED_AT,
    documentationUrl: 'https://www.alibabacloud.com/help/en/model-studio/claude-code',
  },
  'qwen-coding-plan': {
    verifiedAt: VERIFIED_AT,
    documentationUrl: 'https://www.alibabacloud.com/help/en/model-studio/claude-code',
  },
  minimax: {
    verifiedAt: VERIFIED_AT,
    documentationUrl: 'https://platform.minimaxi.com/docs/m-plan/claude-code',
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
  'apiTimeoutMs',
  'disableNonessentialTraffic',
  'maxOutputTokens',
]

export function providerMatchesDefaultTemplate(provider: Provider) {
  const template = defaultProviders.find((candidate) => candidate.id === provider.id)
  return Boolean(template && templateFields.every((field) => provider[field] === template[field]))
}
