# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> BiliGo LLM provider flow (mocked) >> rate limit (429) shows friendly quota message
- Location: e2e/smoke.spec.ts:331:2

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.bili-agent-error--rate-limit')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('.bili-agent-error--rate-limit')

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
- textbox "三角洲行动"
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
  - link "甄家班喻亢主演，隐世杀手血洗黑帮！":
    - /url: https://www.bilibili.com/bangumi/play/ep5076809
    - img "甄家班喻亢主演，隐世杀手血洗黑帮！"
  - link "2026“次元奇旅”暑期狂欢节":
    - /url: https://live.bilibili.com/blackboard/era/5QLqxye7tDmgI73D.html?live_from=81001
    - img "2026“次元奇旅”暑期狂欢节"
  - link "始于欺骗的爱恋，该如何收场？":
    - /url: https://www.bilibili.com/bangumi/play/ep5022030
    - img "始于欺骗的爱恋，该如何收场？"
  - link "领克07GT上市限时价已开":
    - /url: //cm.bilibili.com/cm/api/fees/pc/sync/v2?msg=a%7C4697%2Cb%7Cbilibili%2Cc%7C1%2Cd%7C1%2Ce%7CCAAQABiAwJ7dtduKuhAgACgAMB042SRCIDE3ODU4MTcyMTYzNjZxMTBhODVhMTA2YTEyM3E2ODg1SO7qgNj8M1IG6Z2S5bKbWgblsbHkuJxiBuS4reWbvWhkcAB4gICAgMAhgAEAiAGqpwWSAQ02MS4xNTYuMTEzLjgwmgEAoAEAsgEg7xn0N%2FeY8wDgUL1lEqdMyij432WprU8VuKXeX1ztKQO6AY0EaHR0cHM6Ly8xMkFEMTAwMDA0LTEubS5jdHJtaS5jbi90L2FkMj9laWQ9MTJBRDEwMDAwNCZzZHI9Y2x0JmFjPTEmaWRmYT1fX0lERkFNRDVfXyZjYWlkMT1fX0NBSUQxX18maW1laT1fX0lNRUlfXyZhZGlkPV9fQU5EUk9JRElEX18mbWFjPV9fTUFDX18mY2FpZD1fX0NBSURfXyZ0cz1fX1RTX18mdWE9TW96aWxsYSUyRjUuMCslMjhXaW5kb3dzK05UKzEwLjAlM0IrV2luNjQlM0IreDY0JTI5K0FwcGxlV2ViS2l0JTJGNTM3LjM2KyUyOEtIVE1MJTJDK2xpa2UrR2Vja28lMjkrQ2hyb21lJTJGMTUxLjAuNzkyMi4zNCtTYWZhcmklMkY1MzcuMzYmb2FpZD1fX09BSURNRDVfXyZvc3Y9X19PU1ZTX18mcnFpZD1wYmFlcy5hcm04LXh5cTR0RWxhNThxQWktY2RUdjkyUUMtekJORTkwc2I0eUFhdzhObVdjdm90VWVmcFZ3MVhCQ3FhT3ctVVdoMDFWZy1hRjh5dkptVV93djJaZyUzRCUzRCZpcD02MS4xNTYuMTEzLjgwJm1hYzE9X19NQUMxX18mb3M9MyZyZD1odHRwczovL3d3dy5iaWxpYmlsaS5jb20vdmlkZW8vQlYxdnFnUTZORTl2wgEA0gEA2AGMAuABAOgBAPABAIACAogCALgCAMACANACANgCAOoCAPACt5Es%2BAIAiAMAkgMAqAMAsAMAuAMAwgMAyAOfjQbSA7ABeyIxIjoiMTE4NTYxOTcyMzUyOTE5OTYxNiIsIjIiOiIyOSIsIjMiOiIyOSIsIjYiOiIxNTQ0XzAiLCIxMiI6IjQ2OTciLCIxMyI6IjU1OTYyMCIsIjE0IjoiMCIsIjE1IjoiMCIsIjE2IjoiNTU5NjIwXzAiLCIxNyI6IjQ2OTQiLCIxOSI6Ijg2OTU0IiwiMjUiOiI2MjEiLCIyNiI6IjYyNiIsIjI3IjoiOTcyIn3gAwDoAwDwAwD6AwVvdGhlcoIECW51bGw6bnVsbJgEAKAEAKoEBAgAEASwBADiBJQCNTYueyJwc0lkIjoxNDE4NTMsInYyIjoiSWw4OWFJMXNYaE9qak51RFV2Z3VNYTYyRzZweG1WMjhRNHQxSGRRT0UxRlVyYlJTeTNybnN1aXVDaVJlSDZ2R1I1U1RKVVVVT0U5dzg1Skt6TlFfZ21OTFl3VGE0VWVwWjh4bl9KVFVEV1pCMDhWemNwRk1Oc09hWlNjdHRwQ2N4dW1oUWtsYjhnT053MGd5MWxGVkFLRm9SYXJvYWpUcWp2US02U3NWMXZYcEFtNjVXOGF5YjZUN1FnbzdfQSJ9OzYzLnsicHNJZCI6MTQxNjc1LCJ2MiI6IkF2SEcifTs3MC57InBzSWQiOjExNDc4MCwidjIiOiJBQSJ9%2BgQCe32QBYAEkAWBBJAFgQiQBYUCkAWKCJAFiwiQBQ%2BQBY8GkAWTApAFmgKQBZwIkAWgCJAFowiQBaUIkAUmkAWmBpAFqgiQBasEkAWvBJAFsASQBbEEkAUykAWyBJAFM5AFswKQBbQEkAU1kAW3ApAFtwiQBbgEkAW7ApAFvRCQBb8IkAXAApAFwgKQBUOQBcMCkAXFCJAFSJAFyAiQBcsQkAXMApAFzgKQBc4QkAXTApAF1gKQBdcCkAXYApAF2gKQBdwCkAXfApAFYpAF5QSQBeoCkAXvApAF8AKQBXKQBfUCkAX8ApAF%2FQKQBf4CkAX%2FApAFggOQBYQBkAWGAZAFhgOQBYgBkAWJAZAFigOQBY0HkAWSA5AFkweQBZQDkAWhEZAFogOQBaQDkAWlA5AFpwOQBagDkAWsAZAFsAOQBbEBkAWxA5AFtAGQBcIHkAXGBZAFyAGQBcgFkAXNA5AF0AGQBdEBkAXSEZAF0wOQBdMHkAXUB5AF1wOQBdgBkAXiB5AF5QOQBegBkAXoA5AF6gOQBesDkAXxAZAF8gOQBfIHkAX1A5AF9wOQBfgDkAX%2FA6AFAMgFB9IFAOAFAw%3D%3D%2Cf%7Cclick_sync_3%2Cg%7C1%2Ch%7C3%2Ci%7C%2Cj%7C%2Ck%7C1785817216826%2Cl%7C4694%2Cm%7C1785817216734%2Cn%7C1%2Co%7C0%2Cp%7Cad_card&ts=1785817216826
    - img "领克07GT上市限时价已开"
  - link "天下第一修仙大会？一人单挑全天下！":
    - /url: https://www.bilibili.com/bangumi/play/ep3065339
    - img "天下第一修仙大会？一人单挑全天下！"
  - link "大育天魔经怎么可能有我不会的用法":
    - /url: https://www.bilibili.com/bangumi/play/ep3537940
    - img "大育天魔经怎么可能有我不会的用法"
  - link "一笔画彩虹！写字画画都好梦幻":
    - /url: //www.bilibili.com/video/BV1owGV6aEob?track_id=
    - img "一笔画彩虹！写字画画都好梦幻"
  - link "最详细的攻略都在这里了！":
    - /url: https://www.bilibili.com/blackboard/era/GLZbeast.html
    - img "最详细的攻略都在这里了！"
  - link "「全网独家」地表最强打野出经验包啦！":
    - /url: https://www.bilibili.com/video/BV1dXN76tE11/?csource=activity_0726_hc_banner
    - img "「全网独家」地表最强打野出经验包啦！"
  - link "甄家班喻亢主演，隐世杀手血洗黑帮！":
    - /url: https://www.bilibili.com/bangumi/play/ep5076809
    - img "甄家班喻亢主演，隐世杀手血洗黑帮！"
  - link "2026“次元奇旅”暑期狂欢节":
    - /url: https://live.bilibili.com/blackboard/era/5QLqxye7tDmgI73D.html?live_from=81001
    - img "2026“次元奇旅”暑期狂欢节"
  - link "始于欺骗的爱恋，该如何收场？":
    - /url: https://www.bilibili.com/bangumi/play/ep5022030
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
  - link "1分钟听完8国调式的《千本樱》。 426.2万 1940 00:57":
    - /url: https://www.bilibili.com/video/BV1hm3W6mEwK
    - img "1分钟听完8国调式的《千本樱》。"
    - img
    - text: 426.2万
    - img
    - text: 1940 00:57
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
  - link "直播 2155 萌宅领域":
    - /url: //live.bilibili.com/1982726843?hotRank=0&live_from=81003
    - img
    - text: 直播
    - img
    - text: 2155 萌宅领域
  - paragraph:
    - link "直播中 170 极品 漫画身材":
      - /url: //live.bilibili.com/1982726843?hotRank=0&live_from=81003
  - paragraph:
    - link "MIAO又MIAO":
      - /url: //space.bilibili.com/1768700359
      - img
      - text: MIAO又MIAO
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
  299 | 		).toBeVisible({ timeout: 5000 });
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
> 362 | 		await expect(error).toBeVisible({ timeout: 5000 });
      |                       ^ Error: expect(locator).toBeVisible() failed
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