/**
 * 简烟测试 - 验证 E2E Fixture 模块的可导入性和基本功能
 * 
 * 设计依据：2.1 需求 - 验证 fixture 模块可导入（修复后）
 * 测试范围（Verification，非 Adversarial）：
 * 1. Fixture 模块可导入 - seedSettingsToStorage / buildStorageSeedScript / createMockPortPair 为函数
 * 2. buildStorageSeedScript 输出验证 - 非空字符串，包含 chrome.storage.local.set 调用
 * 3. createMockPortPair 返回验证 - {client, service} 对象，各有 postMessage/onMessage/disconnect
 * 4. createMockPortPair 消息语义验证 - client.postMessage 触发 service.onMessage
 */

import { describe, test, expect } from 'vitest';
import {
  seedSettings,
  emptySettings,
  SETTINGS_STORAGE_KEY,
  seedSettingsToStorage,
  buildStorageSeedScript,
  createMockPortPair,
  type SeedSettings,
  type MockPort,
} from '../../e2e/fixtures/chrome-mock.js';
import {
  openBilibiliWithMockedExtension,
  openPanel,
  closePanel,
  openSettings,
  backToChat,
} from '../../e2e/fixtures/extension-harness.js';

describe('E2E Fixture Module - Import & Basic Functionality', () => {
  // ====== 第1部分：Fixture 模块可导入性验证 ======

  test('chrome-mock 导出 seedSettings 为函数', () => {
    expect(typeof seedSettings).toBe('function');
  });

  test('chrome-mock 导出 emptySettings 为函数', () => {
    expect(typeof emptySettings).toBe('function');
  });

  test('chrome-mock 导出 seedSettingsToStorage 为函数', () => {
    expect(typeof seedSettingsToStorage).toBe('function');
  });

  test('chrome-mock 导出 buildStorageSeedScript 为函数', () => {
    expect(typeof buildStorageSeedScript).toBe('function');
  });

  test('chrome-mock 导出 createMockPortPair 为函数', () => {
    expect(typeof createMockPortPair).toBe('function');
  });

  test('chrome-mock 导出 SETTINGS_STORAGE_KEY 为字符串', () => {
    expect(typeof SETTINGS_STORAGE_KEY).toBe('string');
    expect(SETTINGS_STORAGE_KEY).toBe('bili-agent-settings');
  });

  test('extension-harness 导出 openBilibiliWithMockedExtension 为函数', () => {
    expect(typeof openBilibiliWithMockedExtension).toBe('function');
  });

  test('extension-harness 导出 openPanel 为函数', () => {
    expect(typeof openPanel).toBe('function');
  });

  test('extension-harness 导出 closePanel 为函数', () => {
    expect(typeof closePanel).toBe('function');
  });

  test('extension-harness 导出 openSettings 为函数', () => {
    expect(typeof openSettings).toBe('function');
  });

  test('extension-harness 导出 backToChat 为函数', () => {
    expect(typeof backToChat).toBe('function');
  });

  // ====== 第2部分：seedSettings 输出验证 ======

  test('seedSettings() 返回完整的 SeedSettings 对象', () => {
    const result = seedSettings();
    
    // 验证基本结构
    expect(result).toHaveProperty('providers');
    expect(result).toHaveProperty('activeProviderId');
    expect(result).toHaveProperty('themeMode');

    // 验证 providers 为非空数组
    expect(Array.isArray(result.providers)).toBe(true);
    expect(result.providers.length).toBeGreaterThan(0);

    // 验证首个 provider 包含 openrouter
    const firstProvider = result.providers[0];
    expect(firstProvider.id).toBe('openrouter');
    expect(firstProvider.name).toBe('OpenRouter');
    expect(firstProvider.format).toBe('openai');
    expect(firstProvider.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(firstProvider.model).toBe('openai/gpt-4o-mini');
    expect(firstProvider.isBuiltIn).toBe(true);
    expect(firstProvider.isCustom).toBe(false);

    // 验证 apiKey 为测试密钥
    expect(firstProvider.apiKey).toBe('test-key');

    // 验证 activeProviderId 指向 openrouter
    expect(result.activeProviderId).toBe('openrouter');

    // 验证 themeMode
    expect(result.themeMode).toBe('auto');
  });

  test('emptySettings() 返回空 providers 的 SeedSettings', () => {
    const result = emptySettings();

    expect(result.providers).toEqual([]);
    expect(result.activeProviderId).toBeNull();
    expect(result.themeMode).toBe('auto');
  });

  // ====== 第3部分：buildStorageSeedScript 输出验证 ======

  test('buildStorageSeedScript() 返回非空字符串', () => {
    const script = buildStorageSeedScript();

    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
  });

  test('buildStorageSeedScript(settings) 输出包含 chrome.storage.local.set 调用', () => {
    const seed = seedSettings();
    const script = buildStorageSeedScript({ settings: seed });

    expect(script).toContain('chrome.storage.local.set');
  });

  test('buildStorageSeedScript() 默认清除模式包含 chrome.storage.local.remove', () => {
    const script = buildStorageSeedScript({ settings: null });

    expect(script).toContain('chrome.storage.local.remove');
  });

  test('buildStorageSeedScript(settings) 包含序列化的 settings 数据', () => {
    const seed = seedSettings();
    const script = buildStorageSeedScript({ settings: seed });

    // 验证脚本中包含 SETTINGS_STORAGE_KEY
    expect(script).toContain(SETTINGS_STORAGE_KEY);
    // 验证脚本中包含 settings 数据的序列化形式
    expect(script).toContain('openrouter');
    expect(script).toContain('test-key');
  });

  test('buildStorageSeedScript(settingsKey) 使用自定义 settings 键名', () => {
    const customKey = 'custom-settings-key';
    const seed = seedSettings();
    const script = buildStorageSeedScript({
      settings: seed,
      settingsKey: customKey,
    });

    // 自定义键名应出现在脚本中
    expect(script).toContain(customKey);
    // 默认键名不应出现
    expect(script).not.toContain(SETTINGS_STORAGE_KEY);
  });

  test('buildStorageSeedScript() 输出是合法的 JS 表达式', () => {
    const script = buildStorageSeedScript();

    // 表达式应以 chrome.storage.local 开头
    expect(script).toMatch(/^chrome\.storage\.local\./);
  });

  // ====== 第4部分：createMockPortPair 返回结构验证 ======

  test('createMockPortPair() 返回 {client, service} 对象', () => {
    const pair = createMockPortPair();

    expect(pair).toHaveProperty('client');
    expect(pair).toHaveProperty('service');
  });

  test('createMockPortPair() 的 client 有 postMessage / onMessage / onDisconnect / disconnect', () => {
    const { client } = createMockPortPair();

    expect(typeof client.postMessage).toBe('function');
    expect(typeof client.disconnect).toBe('function');
    expect(client.onMessage).toBeDefined();
    expect(client.onDisconnect).toBeDefined();
    expect(typeof client.onMessage.addListener).toBe('function');
    expect(typeof client.onDisconnect.addListener).toBe('function');
  });

  test('createMockPortPair() 的 service 有 postMessage / onMessage / onDisconnect / disconnect', () => {
    const { service } = createMockPortPair();

    expect(typeof service.postMessage).toBe('function');
    expect(typeof service.disconnect).toBe('function');
    expect(service.onMessage).toBeDefined();
    expect(service.onDisconnect).toBeDefined();
    expect(typeof service.onMessage.addListener).toBe('function');
    expect(typeof service.onDisconnect.addListener).toBe('function');
  });

  test('createMockPortPair() 的 Port 有 name 字段', () => {
    const pair = createMockPortPair('test-port');

    expect(pair.client.name).toBe('test-port');
    expect(pair.service.name).toBe('test-port');
  });

  test('createMockPortPair() 默认 name 为 bili-agent-chat', () => {
    const pair = createMockPortPair();

    expect(pair.client.name).toBe('bili-agent-chat');
    expect(pair.service.name).toBe('bili-agent-chat');
  });

  // ====== 第5部分：createMockPortPair 消息语义验证 ======

  test('client.postMessage 触发 service.onMessage 监听器', () => {
    const { client, service } = createMockPortPair();
    let receivedMsg: unknown;

    // 服务端监听消息
    service.onMessage.addListener((msg: unknown) => {
      receivedMsg = msg;
    });

    // 客户端发送消息
    const testMsg = { type: 'test', data: 'hello' };
    client.postMessage(testMsg);

    // 验证服务端接收到消息
    expect(receivedMsg).toEqual(testMsg);
  });

  test('service.postMessage 触发 client.onMessage 监听器', () => {
    const { client, service } = createMockPortPair();
    let receivedMsg: unknown;

    // 客户端监听消息
    client.onMessage.addListener((msg: unknown) => {
      receivedMsg = msg;
    });

    // 服务端发送消息
    const testMsg = { type: 'response', data: 'world' };
    service.postMessage(testMsg);

    // 验证客户端接收到消息
    expect(receivedMsg).toEqual(testMsg);
  });

  test('多个监听器都能接收到消息', () => {
    const { client, service } = createMockPortPair();
    const received: unknown[] = [];

    // 注册多个监听器
    service.onMessage.addListener((msg: unknown) => {
      received.push(msg);
    });
    service.onMessage.addListener((msg: unknown) => {
      received.push(msg);
    });

    // 发送消息
    const testMsg = { type: 'test' };
    client.postMessage(testMsg);

    // 两个监听器都应接收到
    expect(received).toHaveLength(2);
    expect(received[0]).toEqual(testMsg);
    expect(received[1]).toEqual(testMsg);
  });

  test('removeListener 后不再接收消息', () => {
    const { client, service } = createMockPortPair();
    let receivedCount = 0;
    const listener = () => {
      receivedCount++;
    };

    service.onMessage.addListener(listener);
    service.onMessage.removeListener(listener);

    client.postMessage({ type: 'test' });

    expect(receivedCount).toBe(0);
  });

  test('client.disconnect 触发 service.onDisconnect 监听器', () => {
    const { client, service } = createMockPortPair();
    let disconnected = false;

    service.onDisconnect.addListener(() => {
      disconnected = true;
    });

    client.disconnect();

    expect(disconnected).toBe(true);
  });

  test('service.disconnect 触发 client.onDisconnect 监听器', () => {
    const { client, service } = createMockPortPair();
    let disconnected = false;

    client.onDisconnect.addListener(() => {
      disconnected = true;
    });

    service.disconnect();

    expect(disconnected).toBe(true);
  });

  test('断开连接后 postMessage 不再触发监听器', () => {
    const { client, service } = createMockPortPair();
    let receivedMsg: unknown;

    service.onMessage.addListener((msg: unknown) => {
      receivedMsg = msg;
    });

    client.disconnect();
    client.postMessage({ type: 'test' });

    // 断开后的消息不应被接收
    expect(receivedMsg).toBeUndefined();
  });

  test('双向通信 - 完整对话流程', () => {
    const { client, service } = createMockPortPair();
    const responses: unknown[] = [];
    const clientResponses: unknown[] = [];

    // 服务端监听并回复
    service.onMessage.addListener((msg: unknown) => {
      responses.push(msg);
      if (typeof msg === 'object' && msg !== null && 'id' in msg) {
        service.postMessage({ id: (msg as any).id, reply: 'ack' });
      }
    });

    // 客户端监听回复
    client.onMessage.addListener((msg: unknown) => {
      clientResponses.push(msg);
    });

    // 客户端发起请求
    client.postMessage({ id: 1, request: 'query' });

    // 验证双向通信
    expect(responses).toHaveLength(1);
    expect(responses[0]).toEqual({ id: 1, request: 'query' });
    expect(clientResponses).toHaveLength(1);
    expect(clientResponses[0]).toEqual({ id: 1, reply: 'ack' });
  });
});
