/**
 * Chrome API Mock Fixture - E2E 测试用 Chrome 扩展 API 模拟
 *
 * 设计依据：4.5 SC-4 + §0.1 E2E 默认使用可控 mock/fixture
 * 参照旧仓库 Backend/BiliAgent/packages/extension/e2e/smoke.spec.ts 中的 installChromeApiMock
 *
 * 本 fixture 在 Node 端导出类型定义和种子数据，并提供一个 buildChromeMockScript()
 * 函数，返回一段可在页面上下文（page.addInitScript）中执行的 JS 字符串。
 * 这样做是因为 addInitScript 要求函数自包含（不能引用闭包变量），
 * 用字符串形式可避免序列化陷阱，且方便在脚本内嵌入种子 settings 数据。
 */

// 仅导入类型（用 import type 避免把值引入 e2e bundle，减少 e2e 依赖）
import type { ProviderConfig } from '../../src/lib/shared-types/provider.js';

/** 存储区名称，对齐 chrome.storage.onChanged 的 AreaName 类型 */
export type StorageAreaName = 'local' | 'session' | 'sync' | 'managed';

/** chrome.storage.StorageChange 对应结构 */
export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

/** chrome.permissions.Permissions 对应结构 */
export interface ChromePermissions {
  origins?: string[];
  permissions?: string[];
}

/**
 * 种子 settings 类型，与 BiliAgentSettings 对齐但放宽为 fixture 友好形态。
 * 设计依据：Main/src/config/settings.ts BiliAgentSettings
 */
export interface SeedSettings {
  providers: ProviderConfig[];
  activeProviderId: string | null;
  themeMode?: 'auto' | 'light' | 'dark';
}

/** Chrome mock 配置选项 */
export interface ChromeMockOptions {
  /** 预置写入 chrome.storage.local 的 settings 键值 */
  settings?: SeedSettings | null;
  /** settings 在 storage.local 中的存储键名（默认 bili-agent-settings） */
  settingsKey?: string;
  /** 默认是否授权成功（permissions.request 返回值） */
  permissionsGranted?: boolean;
}

/** settings 存储 key，需与 Main/src/config/settings.ts SETTINGS_STORAGE_KEY 一致 */
export const SETTINGS_STORAGE_KEY = 'bili-agent-settings';

/**
 * 构造一份带 openrouter 内置 provider + 测试 apiKey 的种子 settings。
 * 设计依据：4.5 §0.1 E2E 默认使用可控 mock/fixture - 不依赖真实 API Key。
 */
export function seedSettings(): SeedSettings {
  const openrouter: ProviderConfig = {
    id: 'openrouter',
    name: 'OpenRouter',
    format: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: 'test-key',
    model: 'openai/gpt-4o-mini',
    isBuiltIn: true,
    isCustom: false,
  };
  return {
    providers: [openrouter],
    activeProviderId: 'openrouter',
    themeMode: 'auto',
  };
}

/**
 * 构造一份空 settings（activeProviderId=null，用于触发"未配置 provider"错误路径）。
 */
export function emptySettings(): SeedSettings {
  return {
    providers: [],
    activeProviderId: null,
    themeMode: 'auto',
  };
}

/**
 * 生成一段可在页面上下文执行的 Chrome API Mock 脚本字符串。
 *
 * 该脚本会在 page.addInitScript({ content }) 中作为页面初始化脚本执行，
 * 在 content script 加载前覆盖 window.chrome，从而隔离真实扩展 API。
 *
 * 注意：脚本字符串内部不能引用任何外部变量，只能从 options 参数读取配置。
 * 这里用 JSON.stringify 把 seed 数据嵌入字符串，避免闭包序列化问题。
 *
 * Mock 覆盖的 API：
 * - storage.local.get/set/remove（内存存储 + onChanged 通知）
 * - storage.session.get/set
 * - storage.onChanged.addListener/removeListener
 * - runtime.connect（返回 mock Port：postMessage/onMessage/onDisconnect/disconnect）
 * - runtime.sendMessage / onMessage.addListener
 * - runtime.id
 * - permissions.request（默认返回 true）/ permissions.contains（默认返回 false）
 * - cookies.get/getAll
 * - tabs.create/query
 */
export function buildChromeMockScript(options: ChromeMockOptions = {}): string {
  const settings = options.settings ?? null;
  const settingsKey = options.settingsKey ?? SETTINGS_STORAGE_KEY;
  const permissionsGranted = options.permissionsGranted ?? true;

  // 把种子数据序列化为 JSON，嵌入脚本字符串内
  const seedStorage: Record<string, unknown> = {};
  if (settings) {
    seedStorage[settingsKey] = settings;
  }
  const seedStorageJson = JSON.stringify(seedStorage);
  const permissionsGrantedJson = JSON.stringify(permissionsGranted);

  // 返回的脚本在页面上下文中以 IIFE 执行，设置 window.chrome
  return `
(function() {
  // 种子存储数据（从 Node 端序列化传入）
  var seedStorage = ${seedStorageJson};
  var permissionsGranted = ${permissionsGrantedJson};
  var storage = Object.assign({}, seedStorage);

  // storage.onChanged 监听器集合
  var storageListeners = [];
  // runtime.onMessage 监听器集合
  var runtimeMessageListeners = [];

  function getStorage(keys) {
    if (Array.isArray(keys)) {
      var result = {};
      for (var i = 0; i < keys.length; i++) {
        result[keys[i]] = storage[keys[i]];
      }
      return Promise.resolve(result);
    }
    if (typeof keys === 'string') {
      var obj = {};
      obj[keys] = storage[keys];
      return Promise.resolve(obj);
    }
    if (keys && typeof keys === 'object') {
      var result2 = {};
      var ks = Object.keys(keys);
      for (var j = 0; j < ks.length; j++) {
        var k = ks[j];
        result2[k] = storage[k] !== undefined ? storage[k] : keys[k];
      }
      return Promise.resolve(result2);
    }
    return Promise.resolve(Object.assign({}, storage));
  }

  function setStorage(items) {
    var changes = {};
    var keys = Object.keys(items);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      changes[key] = { oldValue: storage[key], newValue: items[key] };
      storage[key] = items[key];
    }
    for (var li = 0; li < storageListeners.length; li++) {
      storageListeners[li](changes, 'local');
    }
    return Promise.resolve();
  }

  function removeStorage(keys) {
    var arr = Array.isArray(keys) ? keys : [keys];
    for (var i = 0; i < arr.length; i++) {
      delete storage[arr[i]];
    }
    return Promise.resolve();
  }

  // 创建一个 mock Port，模拟 chrome.runtime.connect 返回的 Port
  function createMockPort(name) {
    var portName = name || 'bili-agent-chat';
    var messageListeners = [];
    var disconnectListeners = [];
    var disconnected = false;
    return {
      name: portName,
      sender: undefined,
      onMessage: {
        addListener: function(cb) { messageListeners.push(cb); },
        removeListener: function(cb) {
          var idx = messageListeners.indexOf(cb);
          if (idx >= 0) messageListeners.splice(idx, 1);
        },
        hasListener: function(cb) { return messageListeners.indexOf(cb) >= 0; },
      },
      onDisconnect: {
        addListener: function(cb) { disconnectListeners.push(cb); },
        removeListener: function(cb) {
          var idx = disconnectListeners.indexOf(cb);
          if (idx >= 0) disconnectListeners.splice(idx, 1);
        },
        hasListener: function(cb) { return disconnectListeners.indexOf(cb) >= 0; },
      },
      // postMessage 默认不触发任何响应；测试可在 page.exposeFunction 后覆盖此行为
      postMessage: function(msg) {
        // 触发本端口 onMessage 监听器（模拟回环）
        for (var i = 0; i < messageListeners.length; i++) {
          messageListeners[i](msg, null);
        }
      },
      disconnect: function() {
        if (disconnected) return;
        disconnected = true;
        for (var i = 0; i < disconnectListeners.length; i++) {
          disconnectListeners[i](null);
        }
      },
    };
  }

  window.chrome = {
    runtime: {
      id: 'mock-extension-id',
      sendMessage: function(msg) {
        // 触发 runtime.onMessage 监听器
        for (var i = 0; i < runtimeMessageListeners.length; i++) {
          runtimeMessageListeners[i](msg, { id: 'mock-extension-id' }, function() {});
        }
        return Promise.resolve(undefined);
      },
      connect: function(connectInfo) {
        var name = (connectInfo && connectInfo.name) || 'bili-agent-chat';
        return createMockPort(name);
      },
      onMessage: {
        addListener: function(cb) { runtimeMessageListeners.push(cb); },
        removeListener: function(cb) {
          var idx = runtimeMessageListeners.indexOf(cb);
          if (idx >= 0) runtimeMessageListeners.splice(idx, 1);
        },
        hasListener: function(cb) { return runtimeMessageListeners.indexOf(cb) >= 0; },
      },
      onConnect: {
        addListener: function() {},
        removeListener: function() {},
      },
      lastError: undefined,
    },
    storage: {
      local: {
        get: getStorage,
        set: setStorage,
        remove: removeStorage,
      },
      session: {
        get: getStorage,
        set: setStorage,
        remove: removeStorage,
      },
      onChanged: {
        addListener: function(cb) { storageListeners.push(cb); },
        removeListener: function(cb) {
          var idx = storageListeners.indexOf(cb);
          if (idx >= 0) storageListeners.splice(idx, 1);
        },
        hasListener: function(cb) { return storageListeners.indexOf(cb) >= 0; },
      },
    },
    permissions: {
      request: function(perms) {
        return Promise.resolve(permissionsGranted);
      },
      contains: function(perms) {
        return Promise.resolve(false);
      },
      getAll: function() {
        return Promise.resolve({ origins: [], permissions: [] });
      },
      remove: function(perms) {
        return Promise.resolve(true);
      },
    },
    cookies: {
      get: function() { return Promise.resolve(null); },
      getAll: function() { return Promise.resolve([]); },
      set: function() { return Promise.resolve(null); },
      remove: function() { return Promise.resolve({}); },
      getAllCookieStores: function() { return Promise.resolve([]); },
    },
    tabs: {
      create: function(props) {
        if (props && props.url) {
          window.open(props.url, '_blank');
        }
        return Promise.resolve({ id: 1 });
      },
      query: function() { return Promise.resolve([]); },
      update: function() { return Promise.resolve({}); },
      remove: function() { return Promise.resolve({}); },
    },
  };
})();
`;
}

/**
 * 返回 IIFE 脚本字符串的类型（字符串），用于 addInitScript({ content })。
 * 与 buildChromeMockScript 一致，命名清晰表达意图。
 */
export type ChromeMockScript = string;
