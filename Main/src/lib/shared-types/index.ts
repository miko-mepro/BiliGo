export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp: number;
  reasoning?: string;
  steps?: AgentStep[];
}

export interface AgentStep {
  id: string;
  type: 'tool_call';
  name: string;
  summary: string;
  status: 'running' | 'completed';
  timestamp: number;
  completedAt?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

export interface BilibiliSearchParams {
  keyword: string;
  page?: number;
  pageSize?: number;
  order?: 'totalrank' | 'click' | 'pubdate' | 'dm' | 'stow';
}

export interface BilibiliVideoCard {
  bvid: string;
  aid: number;
  title: string;
  author: string;
  pic: string;
  play: number;
  videoReview: number;
  favorites: number;
  duration: string;
  pubdate: number;
  tag: string;
  description: string;
}

export interface SlangUnderstandResult {
  original: string;
  normalized: string;
  explanation: string;
  matchedDict: boolean;
}

export interface QueryExpandResult {
  keywords: string[];
  tags: string[];
  categories: string[];
  rationale: string;
}

export interface RerankItem {
  bvid: string;
  score: number;
  reason: string;
}

export interface RerankResult {
  items: RerankItem[];
  strategy: 'llm' | 'fallback';
  trimmed: number;
}

export interface ClarificationRequest {
  question: string;
  options?: string[];
  reason: string;
}

export interface WorkingMemory {
  traceId: string;
  triedKeywords: string[];
  rejectedBvids: string[];
  failureReasons: string[];
  clarificationCount: number;
}

export interface SessionMemory {
  conversationId: string;
  recentUnderstandings: SlangUnderstandResult[];
  recentExpansions: QueryExpandResult[];
  updatedAt: number;
}

export interface ConversationRecord {
  id: string;
  title: string;
  titleFinal: boolean;
  createdAt: number;
  lastActiveAt: number;
  messageCount: number;
}

export interface ConversationData {
  version: 2;
  id: string;
  messages: ChatMessage[];
  videos: BilibiliVideoCard[];
  understandings: Array<SlangUnderstandResult & { receivedAt: number }>;
  expansions: Array<QueryExpandResult & { receivedAt: number }>;
  reranks: Array<RerankResult & { receivedAt: number }>;
  createdAt: number;
  lastActiveAt: number;
}

export interface LightweightLLMRequest {
  type: 'llm-request';
  task: string;
  messages: ChatMessage[];
  options?: {
    maxTokens?: number;
    temperature?: number;
  };
}

export interface LightweightLLMResponse {
  ok: boolean;
  content?: string;
  error?: string;
}

export { sanitize } from './sanitize.js';
export type {
  ApiFormat,
  BuiltInProviderId,
  ProviderConfig,
  BuiltInProviderInfo,
} from './provider.js';
export { BUILT_IN_PROVIDERS } from './provider.js';
