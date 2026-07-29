import type { BiliAgentSettings, ThemeMode } from './settings.js'
import { DEFAULT_SETTINGS } from './settings.js'
import type { ProviderConfig, BuiltInProviderId } from '../lib/shared-types/provider.js'
import { BUILT_IN_PROVIDERS } from '../lib/shared-types/provider.js'

/**
 * 规范化 themeMode 值：只接受 'auto'/'light'/'dark'，其他值回退 'auto'。
 *
 * @param value - 原始 themeMode 值（可能为任意类型）
 * @returns 合法的 ThemeMode 值
 */
function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto'
}

/**
 * 判断给定 id 是否为内置 provider id。
 *
 * 通过检查 BUILT_IN_PROVIDERS 字典是否包含该 key 判定。
 *
 * @param id - 待判定的 provider id
 * @returns 类型谓词，true 表示是内置 provider id
 */
function isBuiltInProviderId(id: string): id is BuiltInProviderId {
  return id in BUILT_IN_PROVIDERS
}

/**
 * 补全单个 provider 的缺失字段，并校验/纠正关键字段。
 *
 * 处理规则：
 * - apiKey/model 缺失或非字符串 -> 补空字符串 ''
 * - format 非 openai/anthropic/gemini -> 回退 'openai'
 * - isBuiltIn/isCustom 按 id 是否在 BUILT_IN_PROVIDERS 中重新判定（纠正脏数据）
 *
 * @param p - 原始 provider 数据（类型未知）
 * @returns 字段完整的 ProviderConfig
 */
function normalizeProvider(p: unknown): ProviderConfig {
  // 防御 null/undefined/原始值数组元素：回退为默认自定义 provider（空字段）
  // 避免 provider.id 在 null 上抛 TypeError 导致面板加载崩溃
  if (p === null || typeof p !== 'object') {
    return {
      id: '',
      name: '',
      format: 'openai',
      baseUrl: '',
      apiKey: '',
      model: '',
      isBuiltIn: false,
      isCustom: true,
    }
  }
  const provider = p as Record<string, unknown>
  // 提取 id，非字符串时回退空串
  const id = typeof provider.id === 'string' ? provider.id : ''
  // 内置/自定义判定依据 id 是否在 BUILT_IN_PROVIDERS
  const isBuiltIn = isBuiltInProviderId(id)

  return {
    id,
    name: typeof provider.name === 'string' ? provider.name : '',
    // format 仅接受三种合法值，否则回退默认 openai
    format:
      provider.format === 'openai' ||
      provider.format === 'anthropic' ||
      provider.format === 'gemini'
        ? provider.format
        : 'openai',
    baseUrl: typeof provider.baseUrl === 'string' ? provider.baseUrl : '',
    // apiKey 缺失补空串
    apiKey: typeof provider.apiKey === 'string' ? provider.apiKey : '',
    // model 缺失补空串
    model: typeof provider.model === 'string' ? provider.model : '',
    // 内置/自定义按 id 判定，纠正旧数据可能存在的错误标记
    isBuiltIn,
    isCustom: !isBuiltIn,
  }
}

/**
 * 设置迁移函数：将任意来源的存储数据规范化为 BiliAgentSettings。
 *
 * 迁移规则（设计依据 AvailableFeatures §十 设置迁移逻辑）：
 * 1. raw 为非对象/空/数组 -> 返回 DEFAULT_SETTINGS（含 9 个内置 provider）
 * 2. raw.providers 为非空数组（已迁移或新格式）-> 直用，逐项补全缺失字段：
 *    - apiKey/model 缺失补 ''
 *    - format 非法值回退 'openai'
 *    - isBuiltIn/isCustom 按是否在 BUILT_IN_PROVIDERS 判定
 * 3. 旧 openRouterApiKey 字段存在且非空 -> 创建 openrouter provider，
 *    返回仅含该 provider 的设置（activeProviderId 设为 openrouter）
 * 4. 旧空 schema 或损坏数据 -> 回退默认 9 内置 provider
 *
 * activeProviderId/themeMode 在各分支中保留或回退默认值。
 *
 * @param raw - 从 chrome.storage.local 读取的原始数据
 * @returns 规范化后的 BiliAgentSettings
 */
export function migrateSettings(raw: unknown): BiliAgentSettings {
  // 规则 1：非对象/空/数组 -> 默认设置
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ...DEFAULT_SETTINGS,
      providers: DEFAULT_SETTINGS.providers.map(p => ({ ...p })),
    }
  }

  const record = raw as Record<string, unknown>

  // 规则 2：已有 providers 数组（已迁移或新格式），逐项补全字段
  if (Array.isArray(record.providers) && record.providers.length > 0) {
    return {
      providers: (record.providers as ProviderConfig[]).map((p) => normalizeProvider(p)),
      activeProviderId:
        typeof record.activeProviderId === 'string' ? record.activeProviderId : null,
      themeMode: normalizeThemeMode(record.themeMode),
    }
  }

  // 规则 3：旧 openRouterApiKey 字段 -> 迁移为 openrouter provider
  if (typeof record.openRouterApiKey === 'string' && record.openRouterApiKey.trim()) {
    return {
      providers: [
        {
          id: 'openrouter',
          name: 'OpenRouter',
          apiKey: record.openRouterApiKey.trim(),
          model: '',
          format: 'openai',
          baseUrl: 'https://openrouter.ai/api/v1',
          isBuiltIn: true,
          isCustom: false,
        },
      ],
      activeProviderId: 'openrouter',
      themeMode: normalizeThemeMode(record.themeMode),
    }
  }

  // 规则 4：旧空 schema 或损坏数据 -> 默认 9 内置 provider
  return {
    providers: Object.values(BUILT_IN_PROVIDERS).map((info) => ({
      ...info,
      apiKey: '',
      model: '',
    })),
    activeProviderId: null,
    themeMode: normalizeThemeMode(record.themeMode),
  }
}
