# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> BiliGo LLM provider flow (mocked) >> configure OpenAI provider, test connection, send chat with mocked SSE
- Location: e2e/smoke.spec.ts:202:2

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-bili-agent-panel]').locator('[data-testid="settings-panel"]').locator('[data-testid="save-success-hint"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('[data-bili-agent-panel]').locator('[data-testid="settings-panel"]').locator('[data-testid="save-success-hint"]')

```

```yaml
- list:
  - listitem:
    - link "首页":
      - /url: //www.bilibili.com
      - img
      - text: 首页
  - listitem:
    - link "番剧":
      - /url: //www.bilibili.com/anime/
  - listitem:
    - link "直播":
      - /url: //live.bilibili.com
  - listitem:
    - link "游戏中心":
      - /url: //game.bilibili.com/platform
  - listitem:
    - link "会员购":
      - /url: //show.bilibili.com/platform/home.html?msource=pc_web
  - listitem:
    - link "漫画":
      - /url: //manga.bilibili.com?from=bill_top_mnav
  - listitem:
    - link "赛事":
      - /url: //www.bilibili.com/match/home/
  - listitem:
    - link "下载客户端":
      - /url: //app.bilibili.com
      - img
      - text: 下载客户端
- textbox "潘宏爱玩狗"
- img
- list:
  - listitem:
    - listitem:
      - text: 登录
      - paragraph: 登录后你可以：
      - img
      - text: 免费看高清视频
      - img
      - text: 多端同步播放记录
      - img
      - text: 发表弹幕/评论
      - img
      - text: 热门番剧影视看不停 立即登录 首次使用？ 点我注册
  - listitem:
    - listitem:
      - link "大会员":
        - /url: //account.bilibili.com/big
        - img
        - text: 大会员
  - listitem:
    - img
    - text: 消息
  - listitem:
    - img
    - text: 动态
  - listitem:
    - img
    - text: 收藏
  - listitem:
    - img
    - text: 历史
  - listitem:
    - img
    - text: 创作中心
  - listitem:
    - listitem:
      - img
      - text: 投稿
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- img
- link "B站 b站":
  - /url: //www.bilibili.com
  - img "B站 b站"
- link "动态":
  - /url: //t.bilibili.com
  - img
  - text: 动态
- link "热门":
  - /url: //www.bilibili.com/v/popular/all
  - img
  - text: 热门
- link "番剧":
  - /url: //www.bilibili.com/anime/
- link "电影":
  - /url: //www.bilibili.com/movie/
- link "国创":
  - /url: //www.bilibili.com/guochuang/
- link "电视剧":
  - /url: //www.bilibili.com/tv/
- link "综艺":
  - /url: //www.bilibili.com/variety/
- link "纪录片":
  - /url: //www.bilibili.com/documentary/
- link "动画":
  - /url: //www.bilibili.com/c/douga/
- link "游戏":
  - /url: //www.bilibili.com/c/game/
- link "鬼畜":
  - /url: //www.bilibili.com/c/kichiku/
- link "音乐":
  - /url: //www.bilibili.com/c/music/
- link "舞蹈":
  - /url: //www.bilibili.com/c/dance/
- link "影视":
  - /url: //www.bilibili.com/c/cinephile/
- link "娱乐":
  - /url: //www.bilibili.com/c/ent/
- link "知识":
  - /url: //www.bilibili.com/c/knowledge/
- link "科技数码":
  - /url: //www.bilibili.com/c/tech/
- link "资讯":
  - /url: //www.bilibili.com/c/information/
- link "美食":
  - /url: //www.bilibili.com/c/food/
- text: 更多
- img
- link "专栏":
  - /url: //www.bilibili.com/read/home/
  - img
  - text: 专栏
- link "直播":
  - /url: //live.bilibili.com
  - img
  - text: 直播
- link "活动":
  - /url: //www.bilibili.com/blackboard/era/reward-activity-list-page.html#/list
  - img
  - text: 活动
- link "课堂":
  - /url: //www.bilibili.com/cheese/?csource=common_hp_channelclass_icon
  - img
  - text: 课堂
- link "社区中心":
  - /url: //www.bilibili.com/blackboard/activity-5zJxM3spoS.html
  - img
  - text: 社区中心
- link "新歌热榜":
  - /url: //music.bilibili.com/pc/music-center/
  - img
  - text: 新歌热榜
- main:
  - link "始于欺骗的爱恋，该如何收场？":
    - /url: https://www.bilibili.com/bangumi/play/ep5022030
    - img "始于欺骗的爱恋，该如何收场？"
  - link "就这个双强拉扯爽！他与她针锋相对！":
    - /url: https://www.bilibili.com/bangumi/play/ep4902582
    - img "就这个双强拉扯爽！他与她针锋相对！"
  - link "大育天魔经怎么可能有我不会的用法":
    - /url: https://www.bilibili.com/bangumi/play/ep3537940
    - img "大育天魔经怎么可能有我不会的用法"
  - link "天下第一修仙大会？一人单挑全天下！":
    - /url: https://www.bilibili.com/bangumi/play/ep3065339
    - img "天下第一修仙大会？一人单挑全天下！"
  - link "最详细的攻略都在这里了！":
    - /url: https://www.bilibili.com/blackboard/era/GLZbeast.html
    - img "最详细的攻略都在这里了！"
  - link "「全网独家」地表最强打野出经验包啦！":
    - /url: https://www.bilibili.com/video/BV1dXN76tE11/?csource=activity_0726_hc_banner
    - img "「全网独家」地表最强打野出经验包啦！"
  - link "普通人如何适应世界最危险的海上工作？":
    - /url: https://www.bilibili.com/bangumi/play/ep5073458
    - img "普通人如何适应世界最危险的海上工作？"
  - link "一笔画彩虹！写字画画都好梦幻":
    - /url: //www.bilibili.com/video/BV1owGV6aEob?track_id=
    - img "一笔画彩虹！写字画画都好梦幻"
  - link "甄家班喻亢主演，隐世杀手血洗黑帮！":
    - /url: https://www.bilibili.com/bangumi/play/ep5076809
    - img "甄家班喻亢主演，隐世杀手血洗黑帮！"
  - link "始于欺骗的爱恋，该如何收场？":
    - /url: https://www.bilibili.com/bangumi/play/ep5022030
    - img "始于欺骗的爱恋，该如何收场？"
  - link "就这个双强拉扯爽！他与她针锋相对！":
    - /url: https://www.bilibili.com/bangumi/play/ep4902582
    - img "就这个双强拉扯爽！他与她针锋相对！"
  - link "大育天魔经怎么可能有我不会的用法":
    - /url: https://www.bilibili.com/bangumi/play/ep3537940
  - list:
    - listitem
    - listitem
    - listitem
    - listitem
    - listitem
    - listitem
    - listitem
    - listitem
    - listitem
  - button:
    - img
  - button:
    - img
  - link "【公测】我们为所有崩铁玩家打造了一个新世界！ 39.4万 990 03:26":
    - /url: https://www.bilibili.com/video/BV1GmGu6LEjX
    - img "【公测】我们为所有崩铁玩家打造了一个新世界！"
    - img
    - text: 39.4万
    - img
    - text: 990 03:26
  - heading "【公测】我们为所有崩铁玩家打造了一个新世界！" [level=3]:
    - link "【公测】我们为所有崩铁玩家打造了一个新世界！":
      - /url: https://www.bilibili.com/video/BV1GmGu6LEjX
  - link "小三月日记 · 08-01":
    - /url: //space.bilibili.com/3537107368806790
    - img
    - text: 小三月日记 · 08-01
  - link "【地球最强！现代最强！史上最强！】「绝对的强者，由此而生的T0，教会你快乐的是」——原来你也玩［超特级］！ 44.3万 205 01:11":
    - /url: https://www.bilibili.com/video/BV1mA3Q6HEz5
    - img "【地球最强！现代最强！史上最强！】「绝对的强者，由此而生的T0，教会你快乐的是」——原来你也玩［超特级］！"
    - img
    - text: 44.3万
    - img
    - text: 205 01:11
  - heading "【地球最强！现代最强！史上最强！】「绝对的强者，由此而生的T0，教会你快乐的是」——原来你也玩［超特级］！" [level=3]:
    - link "【地球最强！现代最强！史上最强！】「绝对的强者，由此而生的T0，教会你快乐的是」——原来你也玩［超特级］！":
      - /url: https://www.bilibili.com/video/BV1mA3Q6HEz5
  - link "异世界游客0号机 · 08-02":
    - /url: //space.bilibili.com/8359357
    - img
    - text: 异世界游客0号机 · 08-02
  - link "《缇姆利亚》第六集丨小潮team 7.2万 4877 13:42":
    - /url: https://www.bilibili.com/video/BV1HaMX6rEfe
    - img "《缇姆利亚》第六集丨小潮team"
    - img
    - text: 7.2万
    - img
    - text: 4877 13:42
  - heading "《缇姆利亚》第六集丨小潮team" [level=3]:
    - link "《缇姆利亚》第六集丨小潮team":
      - /url: https://www.bilibili.com/video/BV1HaMX6rEfe
  - link "小潮team动画 · 18小时前":
    - /url: //space.bilibili.com/3546922224715867
    - img
    - text: 小潮team动画 · 18小时前
  - link "【中国电信的机顶盒】弹出强制升级弹窗，梦回2000年初的短信联盟和那些删不掉的电脑附赠软件 31.6万 160 06:45":
    - /url: https://www.bilibili.com/video/BV1D33t6ZEsX
    - img "【中国电信的机顶盒】弹出强制升级弹窗，梦回2000年初的短信联盟和那些删不掉的电脑附赠软件"
    - img
    - text: 31.6万
    - img
    - text: 160 06:45
  - heading "【中国电信的机顶盒】弹出强制升级弹窗，梦回2000年初的短信联盟和那些删不掉的电脑附赠软件" [level=3]:
    - link "【中国电信的机顶盒】弹出强制升级弹窗，梦回2000年初的短信联盟和那些删不掉的电脑附赠软件":
      - /url: https://www.bilibili.com/video/BV1D33t6ZEsX
  - link "池卿想太多 · 07-30":
    - /url: //space.bilibili.com/37860129
    - img
    - text: 池卿想太多 · 07-30
  - link "1分钟听完8国调式的《千本樱》。 426.2万 1939 00:57":
    - /url: https://www.bilibili.com/video/BV1hm3W6mEwK
    - img "1分钟听完8国调式的《千本樱》。"
    - img
    - text: 426.2万
    - img
    - text: 1939 00:57
  - heading "1分钟听完8国调式的《千本樱》。" [level=3]:
    - link "1分钟听完8国调式的《千本樱》。":
      - /url: https://www.bilibili.com/video/BV1hm3W6mEwK
  - link "万伟康music · 07-30":
    - /url: //space.bilibili.com/15897890
    - img
    - text: 万伟康music · 07-30
  - link "'MOTION (feat. Juicy J)' Official Visualizer Behind | CORTIS 10.5万 2.0万 17:09":
    - /url: https://www.bilibili.com/video/BV1HSMQ6ME2y
    - img "'MOTION (feat. Juicy J)' Official Visualizer Behind | CORTIS"
    - img
    - text: 10.5万
    - img
    - text: 2.0万 17:09
  - heading "'MOTION (feat. Juicy J)' Official Visualizer Behind | CORTIS" [level=3]:
    - link "'MOTION (feat. Juicy J)' Official Visualizer Behind | CORTIS":
      - /url: https://www.bilibili.com/video/BV1HSMQ6ME2y
  - link "CORTIS_BIGHIT · 16小时前":
    - /url: //space.bilibili.com/3546908043774464
    - img
    - text: CORTIS_BIGHIT · 16小时前
  - link "来吧，互相伤害吧 376.0万 1298 02:57":
    - /url: https://www.bilibili.com/video/BV1yJ3v6iEGR
    - img "来吧，互相伤害吧"
    - img
    - text: 376.0万
    - img
    - text: 1298 02:57
  - heading "来吧，互相伤害吧" [level=3]:
    - link "来吧，互相伤害吧":
      - /url: https://www.bilibili.com/video/BV1yJ3v6iEGR
  - link "许主任啊啊啊啊 · 07-28":
    - /url: //space.bilibili.com/1058526577
    - img
    - text: 许主任啊啊啊啊 · 07-28
  - link "直播 3804 无畏契约":
    - /url: //live.bilibili.com/14787896?hotRank=0&live_from=81003
    - img
    - text: 直播
    - img
    - text: 3804 无畏契约
  - paragraph:
    - link "直播中 往里浩三排":
      - /url: //live.bilibili.com/14787896?hotRank=0&live_from=81003
  - paragraph:
    - link "龟龟叁叁":
      - /url: //space.bilibili.com/38833141
      - img
      - text: 龟龟叁叁
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - paragraph
  - button "换一换":
    - img
    - text: 换一换
- img
```

# Test source

```ts
  199 | 		);
  200 | 	});
  201 | 
  202 | 	test("configure OpenAI provider, test connection, send chat with mocked SSE", async ({
  203 | 		page,
  204 | 	}) => {
  205 | 		let testConnectionHits = 0;
  206 | 		let chatHits = 0;
  207 | 
  208 | 		// mock SSE 端点：test_connection 用 stream:false，聊天用 stream:true
  209 | 		// 新仓库连接测试走 generateText（stream:false），聊天走 streamText（stream:true）
  210 | 		await page.route("**/chat/completions", async (route) => {
  211 | 			const request = route.request();
  212 | 			if (request.method() === "OPTIONS") {
  213 | 				await route.fulfill({ status: 204, headers: corsHeaders() });
  214 | 				return;
  215 | 			}
  216 | 
  217 | 			const body =
  218 | 				(request.postDataJSON() as { stream?: boolean } | null) ?? {};
  219 | 			// stream:false -> 连接测试请求（generateText）
  220 | 			if (body.stream === false) {
  221 | 				testConnectionHits += 1;
  222 | 				await route.fulfill({
  223 | 					status: 200,
  224 | 					headers: {
  225 | 						...corsHeaders(),
  226 | 						"Content-Type": "application/json",
  227 | 					},
  228 | 					body: JSON.stringify({
  229 | 						id: "cmpl-test",
  230 | 						choices: [
  231 | 							{
  232 | 								index: 0,
  233 | 								message: { role: "assistant", content: "pong" },
  234 | 								finish_reason: "stop",
  235 | 							},
  236 | 						],
  237 | 					}),
  238 | 				});
  239 | 				return;
  240 | 			}
  241 | 
  242 | 			// stream:true -> 聊天流（streamText）
  243 | 			chatHits += 1;
  244 | 			await route.fulfill({
  245 | 				status: 200,
  246 | 				headers: {
  247 | 					...corsHeaders(),
  248 | 					"Content-Type": "text/event-stream",
  249 | 				},
  250 | 				body: [
  251 | 					'data: {"choices":[{"delta":{"content":"Hello "}}]}',
  252 | 					"",
  253 | 					'data: {"choices":[{"delta":{"content":"world"}}]}',
  254 | 					"",
  255 | 					"data: [DONE]",
  256 | 					"",
  257 | 					"",
  258 | 				].join("\n"),
  259 | 			});
  260 | 		});
  261 | 
  262 | 		await openBilibiliWithMockedExtension(page);
  263 | 
  264 | 		const panel = await openPanel(page);
  265 | 
  266 | 		// 进入设置面板
  267 | 		const settingsPanel = await openSettings(page);
  268 | 
  269 | 		// 切换到"模型"Tab（默认在"通用"Tab）
  270 | 		await settingsPanel.locator('[data-testid="tab-model"]').click();
  271 | 
  272 | 		// 打开 provider 下拉，选择 OpenAI 官方
  273 | 		// ProviderList trigger 按钮 data-testid="provider-dropdown-trigger"
  274 | 		const dropdownTrigger = settingsPanel.locator(
  275 | 			'[data-testid="provider-dropdown-trigger"]',
  276 | 		);
  277 | 		await dropdownTrigger.click();
  278 | 		// 选择 aria-label="选择 OpenAI 官方" 的选项按钮
  279 | 		await settingsPanel
  280 | 			.locator('[data-testid="provider-option"]')
  281 | 			.filter({ hasText: "OpenAI 官方" })
  282 | 			.getByRole("button", { name: "选择 OpenAI 官方" })
  283 | 			.click();
  284 | 
  285 | 		// 填写 API Key（ProviderForm aria-label="API Key"）
  286 | 		const apiKeyInput = settingsPanel.getByLabel("API Key");
  287 | 		await apiKeyInput.fill("mock-key-not-real");
  288 | 
  289 | 		// 填写模型（ProviderForm aria-label="模型"）
  290 | 		// 注意：旧仓库用"默认模型 ID"标签，新仓库标签为"模型"，aria-label="模型"
  291 | 		const modelInput = settingsPanel.getByLabel("模型");
  292 | 		await modelInput.fill("gpt-4o-mini");
  293 | 
  294 | 		// 保存设置（data-testid="save-button"）
  295 | 		await settingsPanel.locator('[data-testid="save-button"]').click();
  296 | 		// 等待保存成功提示出现（data-testid="save-success-hint" 文案"已保存"）
  297 | 		await expect(
  298 | 			settingsPanel.locator('[data-testid="save-success-hint"]'),
> 299 | 		).toBeVisible({ timeout: 5000 });
      |     ^ Error: expect(locator).toBeVisible() failed
  300 | 
  301 | 		// 测试连接（TestConnectionButton data-testid="test-connection-button"）
  302 | 		await settingsPanel
  303 | 			.locator('[data-testid="test-connection-button"]')
  304 | 			.click();
  305 | 		// 等待连接成功结果（data-testid="test-connection-result" + .--ok class）
  306 | 		await expect(
  307 | 			settingsPanel.locator(".bili-agent-model-settings__test-result--ok"),
  308 | 		).toBeVisible({ timeout: 5000 });
  309 | 		expect(testConnectionHits).toBe(1);
  310 | 
  311 | 		// 返回聊天界面
  312 | 		await backToChat(page);
  313 | 
  314 | 		// 发送消息，等待助手回复
  315 | 		await panel.locator(".bili-agent-chat-input__textarea").fill("你好");
  316 | 		await panel.locator(".bili-agent-chat-input__send").click();
  317 | 
  318 | 		// 等待助手消息文本出现"Hello world"
  319 | 		// ChatMessage 组件：.bili-agent-message--assistant .bili-agent-message__text
  320 | 		const assistantText = panel
  321 | 			.locator(".bili-agent-message--assistant .bili-agent-message__text")
  322 | 			.last();
  323 | 		await expect(assistantText).toContainText("Hello world", {
  324 | 			timeout: 5000,
  325 | 		});
  326 | 		expect(chatHits).toBeGreaterThanOrEqual(1);
  327 | 
  328 | 		await optionalScreenshot(page, "task-p5-e2e-happy.png");
  329 | 	});
  330 | 
  331 | 	test("rate limit (429) shows friendly quota message", async ({ page }) => {
  332 | 		// mock 429 响应
  333 | 		await page.route("**/chat/completions", async (route) => {
  334 | 			const request = route.request();
  335 | 			if (request.method() === "OPTIONS") {
  336 | 				await route.fulfill({ status: 204, headers: corsHeaders() });
  337 | 				return;
  338 | 			}
  339 | 			await route.fulfill({
  340 | 				status: 429,
  341 | 				headers: {
  342 | 					...corsHeaders(),
  343 | 					"Content-Type": "application/json",
  344 | 				},
  345 | 				body: JSON.stringify({
  346 | 					error: { message: "rate limit exceeded" },
  347 | 				}),
  348 | 			});
  349 | 		});
  350 | 
  351 | 		// 播种已配置的 OpenAI provider（发消息会走真实 fetch -> page.route 拦截）
  352 | 		await openBilibiliWithMockedExtension(page, {
  353 | 			settings: configuredOpenAiSettings(),
  354 | 		});
  355 | 
  356 | 		const panel = await openPanel(page);
  357 | 		await panel.locator(".bili-agent-chat-input__textarea").fill("hello");
  358 | 		await panel.locator(".bili-agent-chat-input__send").click();
  359 | 
  360 | 		// ErrorDisplay 对 429 渲染 .bili-agent-error--rate-limit
  361 | 		const error = page.locator(".bili-agent-error--rate-limit");
  362 | 		await expect(error).toBeVisible({ timeout: 5000 });
  363 | 		// title 非空（应为"请求太频繁"）
  364 | 		await expect(error.locator(".bili-agent-error__title")).not.toBeEmpty();
  365 | 		// message 非空（应为"请求太频繁，请稍后重试。"）
  366 | 		await expect(error.locator(".bili-agent-error__message")).not.toBeEmpty();
  367 | 
  368 | 		await optionalScreenshot(page, "task-p5-e2e-429.png");
  369 | 	});
  370 | });
  371 | 
```