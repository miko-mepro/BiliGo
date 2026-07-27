import { describe, it, expect } from 'vitest'
import {
	resolveOriginPattern,
	isBuiltInProviderOrigin,
} from '../../src/config/origin-pattern.js'

// P5 任务 1.7：origin 通配模式解析 + 内置 provider origin 判定。
// 验收依据：ACCEPTANCE 要求覆盖端口、路径、子域名、内置域名边界。

describe('resolveOriginPattern', () => {
	it('普通 https 域名（含路径）-> *.hostname 通配', () => {
		expect(resolveOriginPattern('https://api.example.com/v1')).toBe(
			'https://*.api.example.com/*',
		)
	})

	it('无路径的 https 域名 -> 仍用 /* 通配', () => {
		expect(resolveOriginPattern('https://api.deepseek.com')).toBe(
			'https://*.api.deepseek.com/*',
		)
	})

	it('localhost loopback（含端口）-> 不含通配', () => {
		// loopback 已是最小单位，不加 *. 前缀；端口不写入 pattern
		expect(resolveOriginPattern('http://localhost:11434/v1')).toBe(
			'http://localhost/*',
		)
	})

	it('127.0.0.1 loopback -> 不含通配', () => {
		expect(resolveOriginPattern('http://127.0.0.1:8080')).toBe(
			'http://127.0.0.1/*',
		)
	})

	it('IPv4 地址（含端口和路径）-> 不含通配', () => {
		expect(resolveOriginPattern('http://192.168.1.1:8080/api')).toBe(
			'http://192.168.1.1/*',
		)
	})

	it('子域名（多级）-> *.hostname 保留完整子域', () => {
		expect(resolveOriginPattern('https://my.api.example.com/v1')).toBe(
			'https://*.my.api.example.com/*',
		)
	})

	it('顶层域名（无子域）-> 仍用 *. 前缀', () => {
		// chrome origin pattern 中 *.example.com 匹配 example.com 的子域
		expect(resolveOriginPattern('https://example.com/v1')).toBe(
			'https://*.example.com/*',
		)
	})

	it('https 域名无端口 -> 用默认端口通配', () => {
		expect(resolveOriginPattern('https://api.openai.com/v1')).toBe(
			'https://*.api.openai.com/*',
		)
	})

	it('非法协议 ftp -> 返回空字符串', () => {
		expect(resolveOriginPattern('ftp://example.com')).toBe('')
	})

	it('空字符串 -> 返回空字符串', () => {
		expect(resolveOriginPattern('')).toBe('')
	})

	it('无效 URL 字符串 -> 返回空字符串', () => {
		expect(resolveOriginPattern('not-a-url')).toBe('')
	})
})

describe('isBuiltInProviderOrigin', () => {
	it('OpenAI 内置 origin -> true', () => {
		expect(isBuiltInProviderOrigin('https://api.openai.com/v1')).toBe(true)
	})

	it('Ollama 内置 origin（localhost + 端口）-> true', () => {
		expect(isBuiltInProviderOrigin('http://localhost:11434/v1')).toBe(true)
	})

	it('DeepSeek 内置 origin（无路径）-> true', () => {
		expect(isBuiltInProviderOrigin('https://api.deepseek.com')).toBe(true)
	})

	it('自定义非内置域名 -> false', () => {
		expect(isBuiltInProviderOrigin('https://my-custom-api.com/v1')).toBe(false)
	})

	it('域名后缀欺骗 -> false（hostname 严格相等）', () => {
		// hostname = api.openai.com.evil.com，不等于 api.openai.com
		expect(isBuiltInProviderOrigin('https://api.openai.com.evil.com/v1')).toBe(
			false,
		)
	})

	it('内置域名但端口不同 -> true（端口被忽略）', () => {
		// 仅比较 hostname，端口不参与判定
		expect(isBuiltInProviderOrigin('https://api.openai.com:8443/v1')).toBe(true)
	})

	it('空字符串 -> false', () => {
		expect(isBuiltInProviderOrigin('')).toBe(false)
	})

	it('无效 URL -> false', () => {
		expect(isBuiltInProviderOrigin('not-a-url')).toBe(false)
	})

	it('全部 9 个内置 provider 的 origin -> true', () => {
		const builtInUrls = [
			'https://api.openai.com/v1',
			'https://api.anthropic.com/v1',
			'https://generativelanguage.googleapis.com/v1beta',
			'https://api.deepseek.com/v1',
			'https://api.moonshot.cn/v1',
			'https://open.bigmodel.cn/api/paas/v4',
			'https://dashscope.aliyuncs.com/compatible-mode/v1',
			'https://openrouter.ai/api/v1',
			'http://localhost:11434/v1',
		]
		for (const url of builtInUrls) {
			expect(isBuiltInProviderOrigin(url)).toBe(true)
		}
	})
})
