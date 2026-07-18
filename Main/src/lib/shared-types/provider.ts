export type ApiFormat = 'openai' | 'anthropic' | 'gemini';

export type BuiltInProviderId =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'moonshot'
  | 'zhipu'
  | 'qwen'
  | 'openrouter'
  | 'ollama';

export interface ProviderConfig {
  id: string;
  name: string;
  format: ApiFormat;
  baseUrl: string;
  apiKey: string;
  model: string;
  isBuiltIn: boolean;
  isCustom: boolean;
}

export type BuiltInProviderInfo = Omit<ProviderConfig, 'apiKey' | 'model'>;

export const BUILT_IN_PROVIDERS: Record<BuiltInProviderId, BuiltInProviderInfo> = {
  openai: {
    id: 'openai',
    name: 'OpenAI 官方',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    isBuiltIn: true,
    isCustom: false,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic 官方',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    isBuiltIn: true,
    isCustom: false,
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    format: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    isBuiltIn: true,
    isCustom: false,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    format: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    isBuiltIn: true,
    isCustom: false,
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot/Kimi',
    format: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    isBuiltIn: true,
    isCustom: false,
  },
  zhipu: {
    id: 'zhipu',
    name: '智谱 GLM',
    format: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    isBuiltIn: true,
    isCustom: false,
  },
  qwen: {
    id: 'qwen',
    name: '通义千问',
    format: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    isBuiltIn: true,
    isCustom: false,
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    format: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    isBuiltIn: true,
    isCustom: false,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama 本地',
    format: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    isBuiltIn: true,
    isCustom: false,
  },
};
