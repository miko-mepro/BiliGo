import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { devices, test as base } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";
import {
	attachRuntimeEvidence,
	type RuntimeEvidenceCollector,
} from "./runtime-evidence.js";

/** 当前 fixture 文件位于 Main/e2e/fixtures，向上两级即扩展构建目录。 */
const extensionPath = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../dist",
);

/** 与 config 保持一致的稳定化参数，确保 MV3 SW 在测试期间可观测。 */
const extensionArgs = [
	`--disable-extensions-except=${extensionPath}`,
	`--load-extension=${extensionPath}`,
	"--enable-automation",
	"--disable-background-networking",
	"--disable-sync",
	"--no-default-browser-check",
	"--disable-features=TranslateUI",
	"--disable-background-timer-throttling",
	"--disable-renderer-backgrounding",
];

type ExtensionFixtures = {
	runtimeEvidence: RuntimeEvidenceCollector;
};

/** 将标题转换成证据文件名，避免把路径或敏感字符写入文件名。 */
function evidenceFileName(testInfo: { project: { name: string }; titlePath: string[]; workerIndex: number; retry: number }): string {
	const title = [...testInfo.titlePath, testInfo.project.name]
		.join("-")
		.replace(/[^a-zA-Z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 140);
	return `${title || "e2e"}-worker${testInfo.workerIndex}-retry${testInfo.retry}.json`;
}

/** Playwright 扩展测试专用 test：每个用例使用独立持久化 Chromium profile。 */
export const test = base.extend<ExtensionFixtures>({
	context: async ({ playwright }, runFixture) => {
		const userDataDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "bili-go-e2e-")
		);
		let context: BrowserContext | undefined;

		try {
			// 缺少构建产物时直接给出可操作错误，避免误判为 content script 故障。
			const manifest = path.join(extensionPath, "manifest.json");
			await fs.access(manifest);
			context = await playwright.chromium.launchPersistentContext(userDataDir, {
				...devices["Desktop Chrome"],
				args: extensionArgs,
				channel: "chromium",
				headless: true,
			});
			await runFixture(context);
		} finally {
			try {
				await context?.close();
			} finally {
				await fs.rm(userDataDir, { force: true, recursive: true });
			}
		}
	},
	runtimeEvidence: [
		async ({ context, page }, runFixture, testInfo) => {
			const collector = await attachRuntimeEvidence(context, page);
			try {
				await runFixture(collector);
			} finally {
				const outputPath = path.resolve(
					process.cwd(),
					".sisyphus/evidence/runtime",
					evidenceFileName(testInfo),
				);
				await collector.flush(page, outputPath);
			}
		},
		{ auto: true },
	],
});

export { expect } from "@playwright/test";
