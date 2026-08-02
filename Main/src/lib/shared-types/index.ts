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

/**
 * 视频搜索批次（S-3）。
 *
 * 背景：原实现中 ChatState.videos 是一个扁平数组，SET_VIDEOS 直接替换全局数组，
 * 导致新搜索会顶掉旧搜索的视频卡片；而 understanding/expansion/rerank 三类 insight
 * 采用追加策略保留在消息流中，产生"旧 insight 还在、对应视频却没了"的语义错配。
 *
 * 批次模型让每组搜索结果携带自己的身份和渲染锚点，从而挂在触发它的那条输出下面。
 */
export interface VideoBatch {
  /** 批次唯一标识。由 SW 在 bilibili_search 推送时生成，video_rerank 重排推送复用同值 */
  batchId: string;
  /** 该批次的视频数组 */
  videos: BilibiliVideoCard[];
  /** 渲染锚点时间戳：取批次创建时最后一条 assistant 消息的 timestamp，决定批次插入消息流的位置 */
  anchorTimestamp: number;
  /** 批次首次到达时间。与 insight 的 receivedAt 字段语义对齐 */
  receivedAt: number;
  /** 是否已经过 video_rerank 重排。供 S-4 判断客户端排序是否应让位于后端重排顺序 */
  reranked: boolean;
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
  /**
   * 视频批次（S-3）。可选字段，向后兼容策略：
   * 旧版本保存的对话只有扁平 videos，加载时由 migrateVideoBatches 迁移为单批次。
   */
  videoBatches?: VideoBatch[];
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
