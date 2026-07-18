import type { ProviderConfig } from '../lib/shared-types/provider.js'
import { BUILT_IN_PROVIDERS } from '../lib/shared-types/provider.js'

export const SETTINGS_STORAGE_KEY = 'bili-agent-settings'

export type ThemeMode = 'auto' | 'light' | 'dark'

export interface BiliAgentSettings {
  providers: ProviderConfig[]
  activeProviderId: string | null
  themeMode: ThemeMode
}

function createDefaultProviders(): ProviderConfig[] {
  return Object.values(BUILT_IN_PROVIDERS).map((info) => ({
    ...info,
    apiKey: '',
    model: '',
  }))
}

export const DEFAULT_SETTINGS: BiliAgentSettings = {
  providers: createDefaultProviders(),
  activeProviderId: null,
  themeMode: 'auto',
}

export async function readBiliAgentSettings(): Promise<BiliAgentSettings> {
  const result = await chrome.storage.local.get(SETTINGS_STORAGE_KEY)
  return normalizeSettings(result[SETTINGS_STORAGE_KEY])
}

export async function saveBiliAgentSettings(
  settings: BiliAgentSettings,
): Promise<BiliAgentSettings> {
  const normalized = normalizeSettings(settings)
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: normalized })
  return normalized
}

export function normalizeSettings(value: unknown): BiliAgentSettings {
  if (!value || typeof value !== 'object') {
    return DEFAULT_SETTINGS
  }
  return value as BiliAgentSettings
}
