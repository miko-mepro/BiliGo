# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> BiliGo panel UX (no backend) >> side toggle peeks from the page edge and expands on hover
- Location: e2e/smoke.spec.ts:90:2

# Error details

```
TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('[data-bili-agent-toggle]') to be visible

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - list [ref=e6]:
        - listitem [ref=e7]:
          - link "首页" [ref=e8] [cursor=pointer]:
            - /url: //www.bilibili.com
        - listitem [ref=e12]:
          - link "番剧" [ref=e13] [cursor=pointer]:
            - /url: //www.bilibili.com/anime/
        - listitem [ref=e14]:
          - link "直播" [ref=e15] [cursor=pointer]:
            - /url: //live.bilibili.com
        - listitem [ref=e16]:
          - link "游戏中心" [ref=e18] [cursor=pointer]:
            - /url: //game.bilibili.com/platform
        - listitem [ref=e19]:
          - link "会员购" [ref=e20] [cursor=pointer]:
            - /url: //show.bilibili.com/platform/home.html?msource=pc_web
        - listitem [ref=e21]:
          - link "漫画" [ref=e22] [cursor=pointer]:
            - /url: //manga.bilibili.com?from=bill_top_mnav
        - listitem [ref=e23]:
          - link "赛事" [ref=e24] [cursor=pointer]:
            - /url: //www.bilibili.com/match/home/
        - listitem [ref=e25]:
          - link "下载客户端" [ref=e26] [cursor=pointer]:
            - /url: //app.bilibili.com
      - textbox "浙大校花陈闲" [ref=e36]
      - list [ref=e40]:
        - listitem [ref=e41] [cursor=pointer]:
          - listitem [ref=e42]:
            - generic [ref=e43]: 登录
            - generic [ref=e47]:
              - paragraph [ref=e48]: 登录后你可以：
              - generic [ref=e49]:
                - generic [ref=e50]: 免费看高清视频
                - generic [ref=e56]: 多端同步播放记录
                - generic [ref=e61]: 发表弹幕/评论
                - generic [ref=e69]: 热门番剧影视看不停
              - generic [ref=e74]: 立即登录
              - generic [ref=e75]: 首次使用？ 点我注册
        - listitem [ref=e76] [cursor=pointer]:
          - listitem [ref=e78]:
            - link "大会员" [ref=e79]:
              - /url: //account.bilibili.com/big
        - listitem [ref=e85] [cursor=pointer]:
          - generic [ref=e86]: 消息
        - listitem [ref=e91] [cursor=pointer]:
          - generic [ref=e92]: 动态
        - listitem [ref=e100] [cursor=pointer]:
          - generic [ref=e101]: 收藏
        - listitem [ref=e106] [cursor=pointer]:
          - generic [ref=e107]: 历史
        - listitem [ref=e111] [cursor=pointer]:
          - generic [ref=e112]: 创作中心
        - listitem [ref=e118] [cursor=pointer]:
          - listitem [ref=e119]:
            - generic [ref=e120]: 投稿
    - link [ref=e194] [cursor=pointer]:
      - /url: //www.bilibili.com
      - img "B站 b站" [ref=e196]
    - generic [ref=e197]:
      - generic [ref=e198]:
        - link "动态" [ref=e199] [cursor=pointer]:
          - /url: //t.bilibili.com
        - link "热门" [ref=e207] [cursor=pointer]:
          - /url: //www.bilibili.com/v/popular/all
      - generic [ref=e212]:
        - generic [ref=e213]:
          - link "番剧" [ref=e214] [cursor=pointer]:
            - /url: //www.bilibili.com/anime/
          - link "电影" [ref=e215] [cursor=pointer]:
            - /url: //www.bilibili.com/movie/
          - link "国创" [ref=e216] [cursor=pointer]:
            - /url: //www.bilibili.com/guochuang/
          - link "电视剧" [ref=e217] [cursor=pointer]:
            - /url: //www.bilibili.com/tv/
          - link "综艺" [ref=e218] [cursor=pointer]:
            - /url: //www.bilibili.com/variety/
          - link "纪录片" [ref=e219] [cursor=pointer]:
            - /url: //www.bilibili.com/documentary/
          - link "动画" [ref=e220] [cursor=pointer]:
            - /url: //www.bilibili.com/c/douga/
          - link "游戏" [ref=e221] [cursor=pointer]:
            - /url: //www.bilibili.com/c/game/
          - link "鬼畜" [ref=e222] [cursor=pointer]:
            - /url: //www.bilibili.com/c/kichiku/
          - link "音乐" [ref=e223] [cursor=pointer]:
            - /url: //www.bilibili.com/c/music/
          - link "舞蹈" [ref=e224] [cursor=pointer]:
            - /url: //www.bilibili.com/c/dance/
          - link "影视" [ref=e225] [cursor=pointer]:
            - /url: //www.bilibili.com/c/cinephile/
          - link "娱乐" [ref=e226] [cursor=pointer]:
            - /url: //www.bilibili.com/c/ent/
          - link "知识" [ref=e227] [cursor=pointer]:
            - /url: //www.bilibili.com/c/knowledge/
          - link "科技数码" [ref=e228] [cursor=pointer]:
            - /url: //www.bilibili.com/c/tech/
          - link "资讯" [ref=e229] [cursor=pointer]:
            - /url: //www.bilibili.com/c/information/
          - link "美食" [ref=e230] [cursor=pointer]:
            - /url: //www.bilibili.com/c/food/
          - generic [ref=e231]: 更多
        - generic [ref=e235]:
          - link "专栏" [ref=e236] [cursor=pointer]:
            - /url: //www.bilibili.com/read/home/
          - link "直播" [ref=e245] [cursor=pointer]:
            - /url: //live.bilibili.com
          - link "活动" [ref=e252] [cursor=pointer]:
            - /url: //www.bilibili.com/blackboard/era/reward-activity-list-page.html#/list
          - link "课堂" [ref=e259] [cursor=pointer]:
            - /url: //www.bilibili.com/cheese/?csource=common_hp_channelclass_icon
          - link "社区中心" [ref=e263] [cursor=pointer]:
            - /url: //www.bilibili.com/blackboard/activity-5zJxM3spoS.html
          - link "新歌热榜" [ref=e268] [cursor=pointer]:
            - /url: //music.bilibili.com/pc/music-center/
  - main [ref=e272]:
    - generic [ref=e274]:
      - generic [ref=e275]:
        - generic [ref=e282]:
          - generic [ref=e283]:
            - link [ref=e287] [cursor=pointer]:
              - /url: https://www.bilibili.com/blackboard/era/GLZbeast.html
              - img "最详细的攻略都在这里了！" [ref=e289]
            - link [ref=e293] [cursor=pointer]:
              - /url: https://live.bilibili.com/blackboard/era/5QLqxye7tDmgI73D.html?live_from=81001
              - img "2026“次元奇旅”暑期狂欢节" [ref=e295]
            - link [ref=e299] [cursor=pointer]:
              - /url: https://www.bilibili.com/bangumi/play/ep4368412
              - img "见钱眼开？不，这叫默契百分百" [ref=e301]
            - link [ref=e305] [cursor=pointer]:
              - /url: //cm.bilibili.com/cm/api/fees/pc/sync/v2?msg=a%7C4697%2Cb%7Cbilibili%2Cc%7C1%2Cd%7C1%2Ce%7CCAAQABiAwJ7dtduKuhAgACgAMB042SRCIDE3ODU4Mjk4MTE5MjJxMTBhODhhMTAyYTE4OXExMDczSNLNgd78M1IG6Z2S5bKbWgblsbHkuJxiBuS4reWbvWhkcAF4gICAgMAhgAEAiAGqpwWSAQ02MS4xNTYuMTEzLjgwmgEAoAEAsgEgdAdVJZ%2FsQixMQn0OyaUdjQdyMDA2rrNGRbVBP3ucAYO6AY0EaHR0cHM6Ly8xMkFEMTAwMDA0LTEubS5jdHJtaS5jbi90L2FkMj9laWQ9MTJBRDEwMDAwNCZzZHI9Y2x0JmFjPTEmaWRmYT1fX0lERkFNRDVfXyZjYWlkMT1fX0NBSUQxX18maW1laT1fX0lNRUlfXyZhZGlkPV9fQU5EUk9JRElEX18mbWFjPV9fTUFDX18mY2FpZD1fX0NBSURfXyZ0cz1fX1RTX18mdWE9TW96aWxsYSUyRjUuMCslMjhXaW5kb3dzK05UKzEwLjAlM0IrV2luNjQlM0IreDY0JTI5K0FwcGxlV2ViS2l0JTJGNTM3LjM2KyUyOEtIVE1MJTJDK2xpa2UrR2Vja28lMjkrQ2hyb21lJTJGMTUxLjAuNzkyMi4zNCtTYWZhcmklMkY1MzcuMzYmb2FpZD1fX09BSURNRDVfXyZvc3Y9X19PU1ZTX18mcnFpZD1wYmFlcy5kNkpZb3lLaU1PMndyTGIzUWtHNHZtSUJRTzJGZTJHMTluSDB3eTFYTWtBUFJhcGp1Q3BpQTdHU2ViZGxvX21hOFg4bldxbnhXT1N2LUdwM1VPV0xTZyUzRCUzRCZpcD02MS4xNTYuMTEzLjgwJm1hYzE9X19NQUMxX18mb3M9MyZyZD1odHRwczovL3d3dy5iaWxpYmlsaS5jb20vdmlkZW8vQlYxdnFnUTZORTl2wgEA0gEA2AGMAuABAOgBAPABAIACAogCALgCAMACANACANgCAOoCAPACt5Es%2BAIAiAMAkgMAqAMAsAMAuAMAwgMAyAOfjQbSA7ABeyIxIjoiMTE4NTYxOTcyMzUyOTE5OTYxNiIsIjIiOiIyOSIsIjMiOiIyOSIsIjYiOiIxNTQ0XzAiLCIxMiI6IjQ2OTciLCIxMyI6IjU1OTYyMCIsIjE0IjoiMCIsIjE1IjoiMCIsIjE2IjoiNTU5NjIwXzAiLCIxNyI6IjQ2OTQiLCIxOSI6Ijg2OTU0IiwiMjUiOiI2MjEiLCIyNiI6IjYyNiIsIjI3IjoiOTcyIn3gAwDoAwDwAwD6AwVvdGhlcoIECW51bGw6bnVsbJgEAKAEAKoEBAgAEASwBADiBJQCNTYueyJwc0lkIjoxNDE5MzQsInYyIjoiUmFCYVpLVlZnLW5CN2pkd1EzTEhvVnRLSXUtaUc5X21qMGxKLVdVSXo4NUNTWGI5S0JBYkhXWlJXMWVMeXp0Sks3LXNMOGdFdV94N0RpMmx2N2ZJbk8wY0MwUDJDNnV6RHBWUTlvR0lnN2pPWTJhRnJNSHhqLWZ6QXgxdGE0azlQTUhfdzVSYWtsemgwVjVvbl9DcmxFb0hWRF9WdE5XUFlsdm9MMFZHTDNCckxQa1pJdmcxazFvN1NYUUotZyJ9OzYzLnsicHNJZCI6MTQxOTExLCJ2MiI6IkFuaEcifTs3MC57InBzSWQiOjExNDc4MCwidjIiOiJBQSJ9%2BgQCe32QBYAEkAWBBJAFgQiQBYUCkAWKCJAFiwiQBQ%2BQBY8GkAWTApAFmgKQBZwIkAWgCJAFowiQBaUIkAUmkAWmBpAFqgiQBasEkAWvBJAFsASQBbEEkAUykAWyBJAFM5AFswKQBbQEkAU1kAW3ApAFtwiQBbgEkAW7ApAFvRCQBb8IkAXAApAFwgKQBUOQBcMCkAXFCJAFSJAFyAiQBcsQkAXMApAFzgKQBc4QkAXTApAF1gKQBdcCkAXYApAF2gKQBdwCkAXfApAFYpAF5QSQBeoCkAXvApAF8AKQBXKQBfUCkAX8ApAF%2FQKQBf4CkAX%2FApAFggOQBYQBkAWGAZAFhgOQBYgBkAWJAZAFigOQBY0HkAWSA5AFkweQBZQDkAWhEZAFogOQBaQDkAWlA5AFpwOQBagDkAWsAZAFsAOQBbEBkAWxA5AFtAGQBcIHkAXGBZAFyAGQBcgFkAXNA5AF0AGQBdEBkAXSEZAF0wOQBdMHkAXUB5AF1wOQBdgBkAXiB5AF5QOQBegBkAXoA5AF6gOQBesDkAXxAZAF8gOQBfIHkAX1A5AF9wOQBfgDkAX%2FA6AFAMgFAdIFAOAFAw%3D%3D%2Cf%7Cclick_sync_3%2Cg%7C1%2Ch%7C3%2Ci%7C%2Cj%7C%2Ck%7C1785829812738%2Cl%7C4694%2Cm%7C1785829812641%2Cn%7C1%2Co%7C0%2Cp%7Cad_card&ts=1785829812738
              - img "领克07GT上市限时价已开" [ref=e307]
            - link [ref=e311] [cursor=pointer]:
              - /url: https://www.bilibili.com/bangumi/play/ep5022030
              - img "始于欺骗的爱恋，该如何收场？" [ref=e313]
            - link [ref=e317] [cursor=pointer]:
              - /url: https://www.bilibili.com/bangumi/play/ep5073458
              - img "普通人如何适应世界最危险的海上工作？" [ref=e319]
            - link [ref=e323] [cursor=pointer]:
              - /url: https://www.bilibili.com/bangumi/play/ep3065339
              - img "天下第一修仙大会？一人单挑全天下！" [ref=e325]
            - link [ref=e329] [cursor=pointer]:
              - /url: //www.bilibili.com/video/BV1oD3F6tEeX?track_id=
              - img "【万物皆可MBTI征稿】ENTP｜用最清醒的头脑，过最荒诞的人生" [ref=e331]
            - link [ref=e335] [cursor=pointer]:
              - /url: https://www.bilibili.com/bangumi/play/ep5076809
              - img "甄家班喻亢主演，隐世杀手血洗黑帮！" [ref=e337]
            - link [ref=e341] [cursor=pointer]:
              - /url: https://www.bilibili.com/blackboard/era/GLZbeast.html
              - img "最详细的攻略都在这里了！" [ref=e343]
            - link [ref=e347] [cursor=pointer]:
              - /url: https://live.bilibili.com/blackboard/era/5QLqxye7tDmgI73D.html?live_from=81001
              - img "2026“次元奇旅”暑期狂欢节" [ref=e349]
          - generic:
            - link "领克07GT上市限时价已开" [ref=e352] [cursor=pointer]:
              - /url: https://12AD100004-1.m.ctrmi.cn/t/ad2?eid=12AD100004&sdr=clt&ac=1&idfa=__IDFAMD5__&caid1=__CAID1__&imei=__IMEI__&adid=__ANDROIDID__&mac=__MAC__&caid=__CAID__&ts=__TS__&ua=Mozilla%2F5.0%2B(Windows%2BNT%2B10.0%3B%2BWin64%3B%2Bx64)%2BAppleWebKit%2F537.36%2B(KHTML%2C%2Blike%2BGecko)%2BChrome%2F151.0.7922.34%2BSafari%2F537.36&oaid=__OAIDMD5__&osv=__OSVS__&rqid=pbaes.d6JYoyKiMO2wrLb3QkG4vmIBQO2Fe2G19nH0wy1XMkAPRapjuCpiA7GSebdlo_ma8X8nWqnxWOSv-Gp3UOWLSg%3D%3D&ip=61.156.113.80&mac1=__MAC1__&os=3&rd=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV1vqgQ6NE9v
            - list [ref=e355]:
              - listitem [ref=e356] [cursor=pointer]
              - listitem [ref=e359] [cursor=pointer]
              - listitem [ref=e362] [cursor=pointer]
              - listitem [ref=e365] [cursor=pointer]
              - listitem [ref=e368] [cursor=pointer]
              - listitem [ref=e371] [cursor=pointer]
              - listitem [ref=e374] [cursor=pointer]
              - listitem [ref=e377] [cursor=pointer]
              - listitem [ref=e380] [cursor=pointer]
          - generic [ref=e383]:
            - button [ref=e384]
            - button [ref=e387]
        - generic [ref=e393]:
          - link [ref=e394] [cursor=pointer]:
            - /url: https://www.bilibili.com/video/BV1s4GV6LEMh
            - generic [ref=e395]:
              - img "感觉生活压力大时不妨想想这群穿刺手" [ref=e398]
              - generic:
                - generic:
                  - generic:
                    - generic: 53.6万
                    - generic: "294"
                  - generic: 01:13
          - generic [ref=e400]:
            - heading [level=3] [ref=e401]:
              - link "感觉生活压力大时不妨想想这群穿刺手" [ref=e402] [cursor=pointer]:
                - /url: https://www.bilibili.com/video/BV1s4GV6LEMh
            - link "JP是只熊 · 08-01" [ref=e404] [cursor=pointer]:
              - /url: //space.bilibili.com/3601939
              - generic "JP是只熊" [ref=e409]
              - generic [ref=e410]: · 08-01
        - generic [ref=e414]:
          - link [ref=e415] [cursor=pointer]:
            - /url: https://www.bilibili.com/video/BV1W8Gw6yEdL
            - generic [ref=e416]:
              - img "为什么会有狗熊岭的熊会来买东西啊？" [ref=e419]
              - generic:
                - generic:
                  - generic:
                    - generic: 48.5万
                    - generic: "272"
                  - generic: 10:21
          - generic [ref=e421]:
            - heading [level=3] [ref=e422]:
              - link "为什么会有狗熊岭的熊会来买东西啊？" [ref=e423] [cursor=pointer]:
                - /url: https://www.bilibili.com/video/BV1W8Gw6yEdL
            - link "橪韭Ran · 08-02" [ref=e425] [cursor=pointer]:
              - /url: //space.bilibili.com/299810153
              - generic "橪韭Ran" [ref=e430]
              - generic [ref=e431]: · 08-02
        - generic [ref=e435]:
          - link [ref=e436] [cursor=pointer]:
            - /url: https://www.bilibili.com/video/BV19xGg6EE3o
            - generic [ref=e437]:
              - img "“无解的眼神心像海底针～”" [ref=e440]
              - generic:
                - generic:
                  - generic:
                    - generic: 32.0万
                    - generic: "511"
                  - generic: 00:38
          - generic [ref=e442]:
            - heading [level=3] [ref=e443]:
              - link "“无解的眼神心像海底针～”" [ref=e444] [cursor=pointer]:
                - /url: https://www.bilibili.com/video/BV19xGg6EE3o
            - link "凉毅不是笨蛋 · 08-01" [ref=e446] [cursor=pointer]:
              - /url: //space.bilibili.com/360999871
              - generic "凉毅不是笨蛋" [ref=e451]
              - generic [ref=e452]: · 08-01
        - generic [ref=e456]:
          - link [ref=e457] [cursor=pointer]:
            - /url: https://www.bilibili.com/video/BV1uv346WE42
            - generic [ref=e458]:
              - img "小黑屋回归！应粉丝要求挑战我的世界美食吃一天！" [ref=e461]
              - generic:
                - generic:
                  - generic:
                    - generic: 122.4万
                    - generic: "708"
                  - generic: 02:17
          - generic [ref=e463]:
            - heading [level=3] [ref=e464]:
              - link "小黑屋回归！应粉丝要求挑战我的世界美食吃一天！" [ref=e465] [cursor=pointer]:
                - /url: https://www.bilibili.com/video/BV1uv346WE42
            - link "嘴嘴深夜食堂 · 07-31" [ref=e467] [cursor=pointer]:
              - /url: //space.bilibili.com/107278471
              - generic "嘴嘴深夜食堂" [ref=e472]
              - generic [ref=e473]: · 07-31
        - generic [ref=e477]:
          - link [ref=e478] [cursor=pointer]:
            - /url: https://www.bilibili.com/video/BV1FT316xEcH
            - generic [ref=e479]:
              - img "还是以小博大爽啊" [ref=e482]
              - generic:
                - generic:
                  - generic:
                    - generic: 248.3万
                    - generic: "736"
                  - generic: 07:33
          - generic [ref=e484]:
            - heading [level=3] [ref=e485]:
              - link "还是以小博大爽啊" [ref=e486] [cursor=pointer]:
                - /url: https://www.bilibili.com/video/BV1FT316xEcH
            - link "成成大王_三角洲 · 07-29" [ref=e488] [cursor=pointer]:
              - /url: //space.bilibili.com/482317581
              - generic "成成大王_三角洲" [ref=e493]
              - generic [ref=e494]: · 07-29
        - generic [ref=e498]:
          - link [ref=e499] [cursor=pointer]:
            - /url: https://www.bilibili.com/video/BV1Lu3X6TE7a
            - generic [ref=e500]:
              - img "因为被抓损失上亿千万，国家赔偿几十万。这个标准是怎么定的？" [ref=e503]
              - generic:
                - generic:
                  - generic:
                    - generic: 31.9万
                    - generic: "463"
                  - generic: 10:59
          - generic [ref=e505]:
            - heading [level=3] [ref=e506]:
              - link "因为被抓损失上亿千万，国家赔偿几十万。这个标准是怎么定的？" [ref=e507] [cursor=pointer]:
                - /url: https://www.bilibili.com/video/BV1Lu3X6TE7a
            - link "老猫鱼不吃鱼 · 08-02" [ref=e509] [cursor=pointer]:
              - /url: //space.bilibili.com/238365787
              - generic "老猫鱼不吃鱼" [ref=e514]
              - generic [ref=e515]: · 08-02
        - generic [ref=e519]:
          - link [ref=e520] [cursor=pointer]:
            - /url: https://www.bilibili.com/video/BV1emMX68EKo
            - generic [ref=e521]:
              - img "行测圣经 判断推理系统课 定义判断" [ref=e524]
              - generic:
                - generic:
                  - generic:
                    - generic: 2.5万
                    - generic: "139"
                  - generic: 01:23:58
          - generic [ref=e526]:
            - heading [level=3] [ref=e527]:
              - link "行测圣经 判断推理系统课 定义判断" [ref=e528] [cursor=pointer]:
                - /url: https://www.bilibili.com/video/BV1emMX68EKo
            - link "陈怀安_Aaa · 21小时前" [ref=e530] [cursor=pointer]:
              - /url: //space.bilibili.com/500971120
              - generic "陈怀安_Aaa" [ref=e535]
              - generic [ref=e536]: · 21小时前
        - generic [ref=e539]:
          - link "直播 83 情感杂谈" [ref=e541] [cursor=pointer]:
            - /url: //live.bilibili.com/1962434153?hotRank=0&live_from=81003
            - generic [ref=e544]: 直播
            - generic:
              - generic:
                - generic: "83"
                - generic: 情感杂谈
          - generic [ref=e550]:
            - paragraph [ref=e551]:
              - link "直播中 【私皮】多手大哥有救了收留无家可归的大" [ref=e552] [cursor=pointer]:
                - /url: //live.bilibili.com/1962434153?hotRank=0&live_from=81003
                - generic [ref=e553]: 直播中
                - text: 【私皮】多手大哥有救了收留无家可归的大
            - paragraph [ref=e556]:
              - link "凉笙小哭包-冲舰中" [ref=e557] [cursor=pointer]:
                - /url: //space.bilibili.com/3493261245156033
        - generic [ref=e565]:
          - generic:
            - generic:
              - generic:
                - paragraph
                - paragraph
                - paragraph
        - generic [ref=e566]:
          - generic:
            - generic:
              - generic:
                - paragraph
                - paragraph
                - paragraph
        - generic [ref=e567]:
          - generic:
            - generic:
              - generic:
                - paragraph
                - paragraph
                - paragraph
        - generic [ref=e578]:
          - generic:
            - generic:
              - generic:
                - paragraph
                - paragraph
                - paragraph
        - generic [ref=e579]:
          - generic:
            - generic:
              - generic:
                - paragraph
                - paragraph
                - paragraph
        - generic [ref=e580]:
          - generic:
            - generic:
              - generic:
                - paragraph
                - paragraph
                - paragraph
        - generic [ref=e590]:
          - generic:
            - generic:
              - generic:
                - paragraph
                - paragraph
                - paragraph
        - generic [ref=e591]:
          - generic:
            - generic:
              - generic:
                - paragraph
                - paragraph
                - paragraph
        - generic [ref=e592]:
          - generic:
            - generic:
              - generic:
                - paragraph
                - paragraph
                - paragraph
      - button "换一换" [ref=e603] [cursor=pointer]
```

# Test source

```ts
  1   | /**
  2   |  * Extension Harness - E2E 扩展加载与面板操作辅助工具
  3   |  *
  4   |  * 架构变更说明（P5-2.1 reviewer REJECTED 修复）：
  5   |  * 原方案用 page.addInitScript 注入 chrome API mock 到 main world，
  6   |  * 但 MV3 content script 在 isolated world，mock 无效。
  7   |  *
  8   |  * 新方案（方案 B）：
  9   |  * - 不再 addInitScript 注入 chrome mock
  10  |  * - 直接 page.goto(bilibili)，content script 由 Chrome 扩展机制自动注入
  11  |  *   到 isolated world，使用真实 chrome API
  12  |  * - 用 seedSettingsToStorage 播种设置到真实 chrome.storage
  13  |  *   （通过 service worker 上下文执行，普通网页 main world 无 chrome 全局对象）
  14  |  * - 等待 [data-bili-agent-toggle] 出现确认 content script 已挂载
  15  |  * - 网络层 mock 用 page.route（不在 fixture 实现，留给 2.2/2.3 的 spec 文件）
  16  |  *
  17  |  * 设计依据：4.5 SC-4 + §0.1 E2E 默认使用可控 mock/fixture
  18  |  * 参照旧仓库 Backend/BiliAgent/packages/extension/e2e/smoke.spec.ts
  19  |  *
  20  |  * 注意：content script 匹配 *://*.bilibili.com/*，所以必须导航到 bilibili.com 域名
  21  |  * 才会触发扩展自动注入。
  22  |  */
  23  | 
  24  | import type { Locator, Page } from "@playwright/test";
  25  | import { expect } from "@playwright/test";
  26  | import {
  27  | 	SETTINGS_STORAGE_KEY,
  28  | 	type StorageSeedOptions,
  29  | 	seedSettingsToStorage,
  30  | } from "./chrome-mock.js";
  31  | 
  32  | /** 扩展辅助选项 */
  33  | export interface HarnessOptions extends StorageSeedOptions {
  34  | 	/** 导航目标 URL（默认 https://www.bilibili.com） */
  35  | 	url?: string;
  36  | 	/** 导航超时（毫秒，默认 60000） */
  37  | 	navigationTimeoutMs?: number;
  38  | 	/** 等待 content script 注入的超时（毫秒，默认 10000） */
  39  | 	contentScriptTimeoutMs?: number;
  40  | }
  41  | 
  42  | /** 默认导航 URL：bilibili 首页（匹配 manifest content_scripts.matches） */
  43  | const DEFAULT_URL = "https://www.bilibili.com";
  44  | const DEFAULT_NAV_TIMEOUT = 60_000;
  45  | const DEFAULT_CS_TIMEOUT = 10_000;
  46  | 
  47  | /**
  48  |  * 在加载真实扩展的环境下打开 bilibili 页面。
  49  |  *
  50  |  * 方案 B 流程：
  51  |  * 1. 导航到 bilibili（content script 由 Chrome 扩展机制自动注入到 isolated world）
  52  |  * 2. 等待 [data-bili-agent-toggle] 出现，确认 content script 已挂载
  53  |  * 3. 若提供了 settings 选项，用 seedSettingsToStorage 播种到真实 chrome.storage
  54  |  *    （通过 service worker 上下文执行 chrome.storage.local.set）
  55  |  *
  56  |  * seed 时序说明（INFO 文档化）：
  57  |  * seed 在 content script 挂载后才执行（步骤 3 依赖步骤 2 的 toggle 可见）。
  58  |  * 此时 content script 已完成首次初始化（可能用默认 settings 渲染了首界面），
  59  |  * seed 写入 storage 后，扩展通过 chrome.storage.onChanged 监听器被动感知变更
  60  |  * 并同步到 UI。因此测试断言应等待面板内 provider 列表渲染完成，
  61  |  * 而非断言首挂载瞬间的快照状态（首挂载可能仍是默认值）。
  62  |  *
  63  |  * @param page Playwright Page 对象
  64  |  * @param options 可选播种配置与导航参数
  65  |  * @returns 初始化后的 Page（原对象，便于链式调用）
  66  |  */
  67  | export async function openBilibiliWithMockedExtension(
  68  | 	page: Page,
  69  | 	options: HarnessOptions = {},
  70  | ): Promise<Page> {
  71  | 	const url = options.url ?? DEFAULT_URL;
  72  | 	const navTimeout = options.navigationTimeoutMs ?? DEFAULT_NAV_TIMEOUT;
  73  | 	const csTimeout = options.contentScriptTimeoutMs ?? DEFAULT_CS_TIMEOUT;
  74  | 	const settingsKey = options.settingsKey ?? SETTINGS_STORAGE_KEY;
  75  | 
  76  | 	// 1. 导航到 bilibili（content script 会由扩展自动注入 isolated world）
  77  | 	await page.goto(url, {
  78  | 		timeout: navTimeout,
  79  | 		waitUntil: "domcontentloaded",
  80  | 	});
  81  | 
  82  | 	// 2. 等待 toggle 按钮出现，确认 content script 已挂载
  83  | 	//    toggle 按钮带 data-bili-agent-toggle 属性，在 Shadow DOM 内
  84  | 	//    Playwright 默认穿透 open Shadow DOM，直接用属性选择器即可
  85  | 	await page
  86  | 		.locator("[data-bili-agent-toggle]")
> 87  | 		.waitFor({ state: "visible", timeout: csTimeout });
      |    ^ TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
  88  | 
  89  | 	// 3. 若提供了 settings 选项，播种到真实 chrome.storage.local
  90  | 	//    通过 service worker 上下文执行（普通网页 main world 无 chrome 全局对象，
  91  | 	//    P5-2.1 reviewer 第二次 REJECTED CRITICAL 修复）
  92  | 	//
  93  | 	// 守卫修复（P5-2.1 reviewer 第三次 REJECTED MEDIUM）：
  94  | 	// 原代码 const settings = options.settings ?? null 会把 undefined 转为 null，
  95  | 	// 导致 if (settings !== undefined) 永远为 true，undefined 语义（不碰 storage）
  96  | 	// 被错误折叠成 null 语义（清除 storage）。
  97  | 	// 修正：在 null 合并前检查原始 options.settings，三种语义正确区分：
  98  | 	//   undefined -> 跳过播种（不碰 storage）
  99  | 	//   null      -> 清除 storage
  100 | 	//   对象      -> 播种到 storage
  101 | 	if (options.settings !== undefined) {
  102 | 		const settings = options.settings ?? null;
  103 | 		// page.context() 获取所属 BrowserContext，从中取扩展 service worker
  104 | 		await seedSettingsToStorage(page.context(), settings, settingsKey);
  105 | 	}
  106 | 
  107 | 	return page;
  108 | }
  109 | 
  110 | /**
  111 |  * 点击 toggle 按钮打开面板，并等待面板可见。
  112 |  *
  113 |  * @param page 已通过 openBilibiliWithMockedExtension 初始化的 Page
  114 |  * @returns 面板 Locator
  115 |  */
  116 | export async function openPanel(page: Page): Promise<Locator> {
  117 | 	const toggle = page.locator("[data-bili-agent-toggle]");
  118 | 	await expect(toggle).toBeVisible();
  119 | 	await toggle.click();
  120 | 
  121 | 	// 面板容器带 data-bili-agent-panel 属性，在 Shadow DOM 内
  122 | 	const panel = page.locator("[data-bili-agent-panel]");
  123 | 	await expect(panel).toBeVisible({ timeout: 5000 });
  124 | 	return panel;
  125 | }
  126 | 
  127 | /**
  128 |  * 获取面板 Locator（假设面板已打开）。
  129 |  * 不触发点击，仅等待面板可见。
  130 |  *
  131 |  * @param page 已打开面板的 Page
  132 |  * @returns 面板 Locator
  133 |  */
  134 | export async function getPanel(page: Page): Promise<Locator> {
  135 | 	const panel = page.locator("[data-bili-agent-panel]");
  136 | 	await expect(panel).toBeVisible({ timeout: 5000 });
  137 | 	return panel;
  138 | }
  139 | 
  140 | /**
  141 |  * 关闭面板：点击面板内的"关闭面板"按钮（aria-label="关闭面板"）。
  142 |  *
  143 |  * @param page 已打开面板的 Page
  144 |  */
  145 | export async function closePanel(page: Page): Promise<void> {
  146 | 	const closeButton = page.locator('[aria-label="关闭面板"]');
  147 | 	await expect(closeButton).toBeVisible();
  148 | 	await closeButton.click();
  149 | 	// 等待面板隐藏
  150 | 	await expect(page.locator("[data-bili-agent-panel]")).toBeHidden({
  151 | 		timeout: 5000,
  152 | 	});
  153 | }
  154 | 
  155 | /**
  156 |  * 从聊天界面进入设置面板。
  157 |  * 点击 aria-label="Open settings" 按钮，等待设置面板可见。
  158 |  *
  159 |  * 选择器精确化（reviewer MEDIUM 修复）：
  160 |  * 原方案用 .bili-agent-settings 类名（CSS 类，可能匹配多个元素且不精确）。
  161 |  * 改用 data-testid="settings-panel"（SettingsPanel root 元素的唯一标识），
  162 |  * 并降级等待 data-testid="theme-mode-select"（通用 Tab 元素，确保面板已渲染）。
  163 |  *
  164 |  * @param page 已打开聊天面板的 Page
  165 |  * @returns 设置面板 Locator
  166 |  */
  167 | export async function openSettings(page: Page): Promise<Locator> {
  168 | 	const panel = await getPanel(page);
  169 | 	const openSettingsButton = panel.locator('[aria-label="Open settings"]');
  170 | 	await expect(openSettingsButton).toBeVisible();
  171 | 	await openSettingsButton.click();
  172 | 
  173 | 	// 等待设置面板 root 出现（data-testid="settings-panel" 是 SettingsPanel 的唯一标识）
  174 | 	const settingsPanel = panel.locator('[data-testid="settings-panel"]');
  175 | 	await expect(settingsPanel).toBeVisible({ timeout: 5000 });
  176 | 	// 进一步确认通用 Tab 内容已渲染（theme-mode-select 在通用 Tab 默认显示时存在）
  177 | 	await expect(
  178 | 		settingsPanel.locator('[data-testid="theme-mode-select"]'),
  179 | 	).toBeVisible({ timeout: 5000 });
  180 | 	return settingsPanel;
  181 | }
  182 | 
  183 | /**
  184 |  * 从设置面板返回聊天界面。
  185 |  * 点击 aria-label="Back to chat" 按钮。
  186 |  *
  187 |  * @param page 已打开设置的 Page
```