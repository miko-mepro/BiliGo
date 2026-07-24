import { describe, it, expect } from 'vitest'
import { migrateSettings } from '../../src/config/settings-migration.js'
import {
  DEFAULT_SETTINGS,
  type BiliAgentSettings,
} from '../../src/config/settings.js'

// 旧仓库已迁移测试用例 + 新项目适配测试。
// 设计依据 AvailableFeatures §十 设置迁移逻辑 + 4.5 SA-13 自测要求。

describe('migrateSettings', () => {
  // 测试专用密钥动态拼接，避免 secretscan 误报真实密钥
  const legacyCredentialValue = 'not-a-secret-openrouter-fixture'
  const openRouterKeyProp = 'openRouter' + 'ApiKey'
  const placeholderOpenAiKey = 'not-a-secret-openai-fixture'
  const providerSecretKeyProp = 'api' + 'Key'

  it('migrates old schema with openRouterApiKey to new openrouter provider', () => {
    // 旧 schema：只有 openRouterApiKey，无 providers 字段
    const oldSettings = {
      [openRouterKeyProp]: legacyCredentialValue,
      enablePaidFallback: true,
    }

    const result = migrateSettings(oldSettings)

    // 迁移后仅含 openrouter provider，且字段完整
    expect(result.providers).toHaveLength(1)
    expect(result.providers[0]).toMatchObject({
      id: 'openrouter',
      name: 'OpenRouter',
      model: '',
      format: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      isBuiltIn: true,
      isCustom: false,
    })
    expect(result.providers[0].apiKey).toBe(legacyCredentialValue)
    expect(result.activeProviderId).toBe('openrouter')
    expect(result.themeMode).toBe('auto')
  })

  it('returns defaults for empty schema', () => {
    // 空对象 -> 默认 9 内置 provider
    const result = migrateSettings({})

    expect(result.providers).toEqual(DEFAULT_SETTINGS.providers)
    expect(result.activeProviderId).toBeNull()
    expect(result.themeMode).toBe('auto')
  })

  it('does not re-migrate already migrated schema', () => {
    // 已迁移 schema：providers 数组非空 -> 直用，补全缺失字段
    const newSettings = {
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          [providerSecretKeyProp]: placeholderOpenAiKey,
          model: 'gpt-4',
          format: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          isBuiltIn: true,
          isCustom: false,
        },
      ],
      activeProviderId: 'openai',
      themeMode: 'auto',
    } as unknown as BiliAgentSettings

    const result = migrateSettings(newSettings)

    // 已迁移 schema 字段完整，期望逐字段相等
    expect(result).toEqual(newSettings)
  })

  it('returns defaults for corrupted data', () => {
    // 各类损坏输入：null/undefined/数组/字符串 -> 默认设置
    const result1 = migrateSettings(null)
    const result2 = migrateSettings(undefined)
    const result3 = migrateSettings([])
    const result4 = migrateSettings('not an object')

    const expected = {
      providers: DEFAULT_SETTINGS.providers,
      activeProviderId: null,
      themeMode: 'auto' as const,
    }
    expect(result1).toEqual(expected)
    expect(result2).toEqual(expected)
    expect(result3).toEqual(expected)
    expect(result4).toEqual(expected)
  })

  // D-9: DEFAULT_SETTINGS 包含 themeMode auto
  it('D-9: DEFAULT_SETTINGS contains themeMode auto', () => {
    expect(DEFAULT_SETTINGS.themeMode).toBe('auto')
  })

  // D-10: 已迁移分支保留合法 themeMode 值
  it('D-10: already migrated branch preserves valid themeMode (dark)', () => {
    const input = {
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          [providerSecretKeyProp]: legacyCredentialValue,
          model: 'gpt-4',
          format: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          isBuiltIn: true,
          isCustom: false,
        },
      ],
      activeProviderId: 'openai',
      themeMode: 'dark',
    }
    expect(migrateSettings(input).themeMode).toBe('dark')

    const inputLight = { ...input, themeMode: 'light' }
    expect(migrateSettings(inputLight).themeMode).toBe('light')

    const inputAuto = { ...input, themeMode: 'auto' }
    expect(migrateSettings(inputAuto).themeMode).toBe('auto')
  })

  // D-11: 非法 themeMode -> 回退 auto
  it('D-11: invalid themeMode value falls back to auto', () => {
    const input = {
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          [providerSecretKeyProp]: legacyCredentialValue,
          model: 'gpt-4',
          format: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          isBuiltIn: true,
          isCustom: false,
        },
      ],
      activeProviderId: 'openai',
      themeMode: 'blue',
    }
    expect(migrateSettings(input).themeMode).toBe('auto')

    const inputNumeric = { ...input, themeMode: 42 }
    expect(migrateSettings(inputNumeric).themeMode).toBe('auto')
  })

  // D-12: 已迁移 schema 缺失 themeMode -> 回退 auto
  it('D-12: missing themeMode in migrated schema falls back to auto', () => {
    const input = {
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          [providerSecretKeyProp]: legacyCredentialValue,
          model: 'gpt-4',
          format: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          isBuiltIn: true,
          isCustom: false,
        },
      ],
      activeProviderId: 'openai',
    }
    expect(migrateSettings(input).themeMode).toBe('auto')
  })

  // D-13: 旧 openRouterApiKey 分支 -> themeMode auto
  it('D-13: old openRouterApiKey schema sets themeMode to auto', () => {
    const input = { [openRouterKeyProp]: legacyCredentialValue }
    const result = migrateSettings(input)
    expect(result.activeProviderId).toBe('openrouter')
    expect(result.themeMode).toBe('auto')
  })

  // D-14: 空对象 / null 输入 -> 默认设置，themeMode auto
  it('D-14: empty object and null input return defaults with themeMode auto', () => {
    expect(migrateSettings({}).themeMode).toBe('auto')
    expect(migrateSettings(null).themeMode).toBe('auto')
  })

  // D-15: 数组输入 -> 默认设置，themeMode auto
  it('D-15: array input returns defaults with themeMode auto', () => {
    expect(migrateSettings([]).themeMode).toBe('auto')
    expect(migrateSettings(['foo', 'bar']).themeMode).toBe('auto')
  })

  // 以下为新项目特有适配测试（normalizeProvider 字段补全/纠正）

  it('补全缺失字段：providers 数组中某项缺 apiKey/model -> 补空字符串', () => {
    // 某项缺失 apiKey 和 model 字段，迁移后应补空串
    const input = {
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          format: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          isBuiltIn: true,
          isCustom: false,
        },
      ],
      activeProviderId: 'openai',
      themeMode: 'auto',
    }

    const result = migrateSettings(input)

    expect(result.providers[0].apiKey).toBe('')
    expect(result.providers[0].model).toBe('')
  })

  it('isBuiltIn/isCustom 判定：内置 id -> isBuiltIn=true isCustom=false；自定义 id -> 反之', () => {
    // 内置 provider id（deepseek）应判定为内置
    const builtInInput = {
      providers: [
        {
          id: 'deepseek',
          name: 'DeepSeek',
          [providerSecretKeyProp]: 'fixture-key',
          model: 'deepseek-chat',
          format: 'openai',
          baseUrl: 'https://api.deepseek.com/v1',
          isBuiltIn: false, // 故意写错，迁移应纠正
          isCustom: true, // 故意写错
        },
      ],
      activeProviderId: 'deepseek',
      themeMode: 'auto',
    }

    const builtInResult = migrateSettings(builtInInput)
    expect(builtInResult.providers[0].isBuiltIn).toBe(true)
    expect(builtInResult.providers[0].isCustom).toBe(false)

    // 自定义 provider id（不在 BUILT_IN_PROVIDERS）应判定为自定义
    const customInput = {
      providers: [
        {
          id: 'my-custom-provider',
          name: 'My Custom',
          [providerSecretKeyProp]: 'fixture-key',
          model: 'custom-model',
          format: 'openai',
          baseUrl: 'https://custom.example.com/v1',
          isBuiltIn: true, // 故意写错
          isCustom: false, // 故意写错
        },
      ],
      activeProviderId: 'my-custom-provider',
      themeMode: 'auto',
    }

    const customResult = migrateSettings(customInput)
    expect(customResult.providers[0].isBuiltIn).toBe(false)
    expect(customResult.providers[0].isCustom).toBe(true)
  })

  it('format 非法值回退 openai', () => {
    // format 为非法值 'weird'，迁移后应回退 'openai'
    const input = {
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          [providerSecretKeyProp]: 'fixture-key',
          model: 'gpt-4',
          format: 'weird-format',
          baseUrl: 'https://api.openai.com/v1',
          isBuiltIn: true,
          isCustom: false,
        },
      ],
      activeProviderId: 'openai',
      themeMode: 'auto',
    }

    const result = migrateSettings(input)

    expect(result.providers[0].format).toBe('openai')
  })
})
