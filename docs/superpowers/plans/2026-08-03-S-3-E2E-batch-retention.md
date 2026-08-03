# S-3 E2E Batch Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-extension E2E regression test proving that two independent searches retain both video batches in the rendered page.

**Architecture:** Extend the existing deterministic helpers in `Main/e2e/agent-flow.spec.ts` so one mock route can produce first-search and second-search payloads. Add one test that drives two complete chat turns through the existing `context.route` service-worker mocks, then asserts four unique video cards remain visible. Production source is unchanged.

**Tech Stack:** TypeScript, Playwright Test, Chromium MV3 extension fixture, `context.route`, OpenAI-compatible SSE fixtures.

## Global Constraints

- Modify only `Main/e2e/agent-flow.spec.ts`.
- Use the existing `extension-fixture` and `openBilibiliWithMockedExtension` helpers.
- Register network routes at `BrowserContext` scope so service-worker fetches are intercepted.
- Do not change production source, protocol types, reducers, render components, or test fixture infrastructure.
- Keep the two batches distinguishable by unique `bvid`, title, and author values.
- Include `index: 0` in each streamed `tool_calls` item because `@ai-sdk/openai@4.0.11` validates that field.
- Return a normal non-stream JSON completion for `generate_title` requests whose body does not set `stream: true`; count only `stream: true` requests as chat turns.
- Do not claim rerank reuse, insight anchor alignment, batch-count limits, or cross-tab synchronization from this test.

---

### Task 1: Parameterize Existing Mock Builders

**Files:**
- Modify: `Main/e2e/agent-flow.spec.ts:118-237`
- Test: `Main/e2e/agent-flow.spec.ts` existing one-search test

**Interfaces:**
- `buildToolCallSseStream(keyword = "退退退", toolCallId = "call_mock_search_1"): string` returns an SSE tool call whose arguments contain the provided keyword and whose tool call id is unique per search.
- `buildTextSseStream(keyword = "退退退"): string` returns the final text SSE for that keyword.
- `buildTitleResponse(keyword = "退退退"): string` returns a non-stream OpenAI chat completion JSON body for the parallel title request.
- `buildBilibiliSearchResponse(batch = "first"): string` returns two deterministic results for either the first or second batch.

- [ ] **Step 1: Update the tool-call helper without changing its default behavior.**

Replace the hard-coded tool call fields with parameters while preserving the current first-search output. The `index: 0` field is required by the installed `openaiChatChunkSchema`; without it the existing baseline fails before `tool_start` is emitted:

```ts
function buildToolCallSseStream(
  keyword = "退退退",
  toolCallId = "call_mock_search_1",
): string {
  // tool_call id 与 keyword 必须随搜索轮次变化，才能验证独立批次。
  // 省略参数时保持现有单搜索测试的行为。
  const toolCallChunk = {
    choices: [
      {
        delta: {
          content: "",
          tool_calls: [
            {
              index: 0,
              id: toolCallId,
              type: "function",
              function: {
                name: "bilibili_search",
                arguments: JSON.stringify({ keyword }),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
        index: 0,
      },
    ],
  };

  return [
    `data: ${JSON.stringify(toolCallChunk)}`,
    "",
    "data: [DONE]",
    "",
    "",
  ].join("\n");
}
```

- [ ] **Step 2: Parameterize the final-text helper.**

Use `keyword` in both text chunks and keep the default text equivalent to the existing test:

```ts
function buildTextSseStream(keyword = "退退退"): string {
  const textChunk1 = {
    choices: [
      {
        delta: { content: `已为你找到${keyword}相关视频，` },
        finish_reason: null,
        index: 0,
      },
    ],
  };
  const textChunk2 = {
    choices: [
      {
        delta: { content: "看看这几个推荐。" },
        finish_reason: "stop",
        index: 0,
      },
    ],
  };

  return [
    `data: ${JSON.stringify(textChunk1)}`,
    "",
    `data: ${JSON.stringify(textChunk2)}`,
    "",
    "data: [DONE]",
    "",
    "",
  ].join("\n");
}
```

- [ ] **Step 3: Add a second deterministic search response.**

Keep the current two first-batch records unchanged. For `batch === "second"`, return exactly two records with unique values, for example:

```ts
type SearchBatch = "first" | "second";

function buildBilibiliSearchResponse(batch: SearchBatch = "first"): string {
  const results = batch === "second"
    ? [
        {
          bvid: "BV1xx000003",
          aid: 100003,
          title: "第二次搜索纪录片",
          author: "第二批UP主",
          pic: "//example.com/p3.jpg",
          tag: "第二次,纪录片",
          play: 23456,
          video_review: 789,
          favorites: 123,
          duration: "04:12",
          pubdate: 1700200000,
          description: "第二次搜索纪录片视频",
        },
        {
          bvid: "BV1xx000004",
          aid: 100004,
          title: "第二次搜索教程",
          author: "第二批教程UP主",
          pic: "//example.com/p4.jpg",
          tag: "第二次,教程",
          play: 6543,
          video_review: 432,
          favorites: 567,
          duration: "05:06",
          pubdate: 1700300000,
          description: "第二次搜索教程视频",
        },
      ]
    : [
        {
          bvid: "BV1xx000001",
          aid: 100001,
          title: "退退退原版鬼畜",
          author: "鬼畜UP主",
          pic: "//example.com/p1.jpg",
          tag: "鬼畜,退退退",
          play: 12345,
          video_review: 678,
          favorites: 901,
          duration: "03:21",
          pubdate: 1700000000,
          description: "退退退原版鬼畜视频",
        },
        {
          bvid: "BV1xx000002",
          aid: 100002,
          title: "退退退舞蹈版",
          author: "舞蹈UP主",
          pic: "//example.com/p2.jpg",
          tag: "舞蹈,退退退",
          play: 5432,
          video_review: 321,
          favorites: 456,
          duration: "02:15",
          pubdate: 1700100000,
          description: "退退退舞蹈改编",
        },
      ];

  return JSON.stringify({
    code: 0,
    message: "0",
    data: { page: 1, pagesize: 20, result: results },
  });
}
```

The response must remain a valid `search/type` payload with `code: 0`, `data.page`, `data.pagesize`, and `data.result`.

- [ ] **Step 4: Add a non-stream title response helper.**

Add this helper so `generate_title` does not consume a chat SSE slot or inject a parse error into the shared Port. The title request omits `stream`, so the route must treat only `stream === true` as a chat turn:

```ts
function buildTitleResponse(keyword = "退退退"): string {
  return JSON.stringify({
    id: "cmpl_mock_title",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: `${keyword}搜索` },
        finish_reason: "stop",
      },
    ],
  });
}
```

- [ ] **Step 5: Run the existing one-search E2E test.**

Run from `Main/`:

```bash
npx playwright test e2e/agent-flow.spec.ts -g "user sends message, AI calls bilibili_search, videos render" --reporter=list
```

Expected: the existing test passes and still sees two first-batch cards. This proves helper parameterization did not change the baseline flow.

### Task 2: Add the Two-Search Batch Retention Test

**Files:**
- Modify: `Main/e2e/agent-flow.spec.ts:261-401`
- Test: `Main/e2e/agent-flow.spec.ts` new S-3 test

**Interfaces:**
- The test consumes the parameterized builders from Task 1.
- The test produces runtime evidence for the S-3 two-search retention claim: two search requests, four visible cards, both unique batches present.

- [ ] **Step 1: Add the test with a four-request AI sequence.**

Use the existing configured settings and harness. Route `/chat/completions` by request number:

```ts
let chatRequestCount = 0;
let titleRequestCount = 0;
const aiBodies = [
  () => buildToolCallSseStream("退退退", "call_mock_search_1"),
  () => buildTextSseStream("退退退"),
  () => buildToolCallSseStream("第二次", "call_mock_search_2"),
  () => buildTextSseStream("第二次"),
];

await context.route("**/chat/completions", async (route) => {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders() });
    return;
  }
  const requestBody = (route.request().postDataJSON() as { stream?: boolean } | null) ?? {};
  if (requestBody.stream !== true) {
    titleRequestCount += 1;
    await route.fulfill({
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: buildTitleResponse("第二次"),
    });
    return;
  }
  chatRequestCount += 1;
  const body = aiBodies[chatRequestCount - 1];
  if (body === undefined) throw new Error("unexpected extra streaming AI request");
  await route.fulfill({
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "text/event-stream" },
    body,
  });
});
```

If more than four non-OPTIONS AI requests occur, fail explicitly instead of silently reusing a response.

- [ ] **Step 2: Route the two B站 responses by hit count.**

Increment `bilibiliSearchHits` before fulfilling the route and select `"first"` for hit 1 and `"second"` for hit 2. Fail explicitly on hit 3 or later. Keep the existing nav route unchanged.

- [ ] **Step 3: Drive the first complete search turn.**

Open the panel, fill the chat textarea with the first query, click send, then wait for the first assistant text and exactly two video cards. Use a bounded Playwright timeout of 10 seconds; do not use arbitrary sleeps.

- [ ] **Step 4: Drive the second complete search turn.**

Wait for the send button to become enabled again, fill the second query, click send, then wait for exactly four cards. Assert both first-batch titles and both second-batch titles are present, and assert `BiliAgent 渲染异常` is absent.

- [ ] **Step 5: Assert mock request counts.**

Assert `chatRequestCount === 4`, `titleRequestCount >= 1`, and `bilibiliSearchHits === 2`. A failure here means the E2E driver did not complete two independent Agent turns and cannot support an S-3 conclusion.

- [ ] **Step 6: Prove the regression test is falsifiable.**

After the test is written, temporarily rebuild a local test artifact with `UPSERT_VIDEO_BATCH` behavior replaced by the pre-S-3 direct replacement behavior, run the new test, and record the expected failure at the four-card assertion. Restore the source immediately, rebuild, and rerun the test. Do not commit the temporary mutation or generated `dist/` output.

### Task 3: Verify, Review, and Commit

**Files:**
- Modify: `Main/e2e/agent-flow.spec.ts`
- Do not stage: `Main/dist/`, `Main/test-results/`, or unrelated worktree changes

- [ ] **Step 1: Run the focused S-3 test.**

```bash
npx playwright test e2e/agent-flow.spec.ts -g "second.*search|batch" --reporter=list
```

Expected: one S-3 test passes with four visible cards, two B站 hits, and four AI requests.

- [ ] **Step 2: Run the full agent-flow suite.**

```bash
npx playwright test e2e/agent-flow.spec.ts --reporter=list
```

Expected: both the original one-search test and the new S-3 test pass.

- [ ] **Step 3: Run static checks.**

```bash
npm run typecheck
npx eslint e2e/agent-flow.spec.ts
npm run build
```

Expected: all commands exit 0. The build-size warning is acceptable if it is the existing Vite warning and no compilation error occurs.

- [ ] **Step 4: Run independent review and test-engineer checks.**

Review only the changed test file for stable selectors, route coverage, request-count assertions, and accidental production scope. A reviewer must return `APPROVED`; a test engineer must return `PASS`.

- [ ] **Step 5: Commit only the E2E test.**

```bash
git add -- Main/e2e/agent-flow.spec.ts
git diff --cached --check
git commit -m "test(S-3): 增加双搜索视频批次保留验证"
```

The commit must not include generated output or unrelated pre-existing worktree changes.
