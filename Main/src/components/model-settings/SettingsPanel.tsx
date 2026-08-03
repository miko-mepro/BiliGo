import type React from "react";
import {
	type CSSProperties,
	type FormEvent,
	useCallback,
	useState,
} from "react";
import {
	isBuiltInProviderOrigin,
	resolveOriginPattern,
} from "../../config/origin-pattern.js";
import {
	type BiliAgentSettings,
	saveBiliAgentSettings,
	type ThemeMode,
} from "../../config/settings.js";
import type { ProviderConfig } from "../../lib/shared-types/provider.js";
import { ProviderForm } from "./ProviderForm.js";
import { ProviderList } from "./ProviderList.js";
import { TestConnectionButton } from "./TestConnectionButton.js";

/**
 * SettingsPanel props 定义。
 *
 * 设计依据 SA-12 硬性契约：port 为必选 prop，由 Panel.tsx 根建立独立 Port
 * 传入（设置专用，不走聊天流），SettingsPanel 再下传给 TestConnectionButton。
 */
export interface SettingsPanelProps {
	/** 初始设置快照，作为内部 state 的初值来源 */
	settings: BiliAgentSettings;
	/** 关闭按钮回调（由 Panel.tsx 提供，用于切回聊天界面） */
	onClose: () => void;
	/** 保存成功回调，传入保存后的规范化设置（由 Panel.tsx 用于同步外层 state） */
	onSaved: (s: BiliAgentSettings) => void;
	/**
	 * 与 SW 的单 Port 连接，必选。
	 * 设计依据 SA-12：经单 Port 发起连接测试，不依赖 ChatProvider 的 Port。
	 * SettingsPanel 将此 port 下传给 TestConnectionButton。
	 */
	port: chrome.runtime.Port;
}

/** Tab 类型：通用 / 模型，设计依据 3.5 §5.1 */
type TabKey = "general" | "model";

/** 保存三态反馈：idle / saving / saved / error，设计依据 3.5 §5 */
type SaveStatus = "idle" | "saving" | "saved" | "error";

/** 主题模式下拉可选项，label 为中文显示文案 */
const THEME_MODE_OPTIONS: readonly { value: ThemeMode; label: string }[] = [
	{ value: "auto", label: "跟随系统" },
	{ value: "light", label: "浅色" },
	{ value: "dark", label: "深色" },
];

/**
 * SettingsPanel -- 正式设置面板容器组件（P5 四组件之一）。
 *
 * 替换 P1 临时 content/settings-panel.tsx，引入两 Tab 结构（设计依据 3.5 §5.1）：
 * - 通用 Tab：主题模式下拉（auto/light/dark），仅维护内部 themeMode state，
 *   随保存按钮一起持久化。不在此处调用 useTheme hook（设计依据 3.5 §5.1
 *   "调用 P3 已冻结的 useTheme hook，不重复实现同步逻辑"），主题生效由
 *   Panel 根的 useTheme 监听 chrome.storage.onChanged 自动同步完成。
 * - 模型 Tab：ProviderList + 选中时显示 ProviderForm + TestConnectionButton。
 *   TestConnectionButton 接收 SettingsPanel props 的 port（SA-12 经单 Port）。
 *
 * 保存三态反馈：idle/saving/saved/error，saved 2s 后回 idle。
 *
 * 内联 style（不用 className），因 Main/ 用 Shadow DOM adoptedStyleSheets，
 * 与 CONSTRAINT 要求一致。
 *
 * @param props 见 SettingsPanelProps
 * @returns React 元素
 */
export function SettingsPanel({
	settings,
	onClose,
	onSaved,
	port,
}: SettingsPanelProps): React.ReactElement {
	// ---- 内部状态 ----
	// providers 列表（内置 + 自定义混合），初值取自 props.settings
	const [providers, setProviders] = useState<ProviderConfig[]>(
		() => settings.providers,
	);
	// 当前激活的 provider id，null 表示未选中
	const [activeProviderId, setActiveProviderId] = useState<string | null>(
		settings.activeProviderId,
	);
	// 主题模式（auto/light/dark），初值取自 props.settings.themeMode
	const [themeMode, setThemeMode] = useState<ThemeMode>(settings.themeMode);
	// 当前激活的 Tab，默认通用 Tab
	const [activeTab, setActiveTab] = useState<TabKey>("general");
	// 保存三态反馈状态
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	// 保存失败时的错误信息（saveStatus==='error' 时存）
	const [saveError, setSaveError] = useState<string>("");

	// 查找当前选中的 provider 对象，供 ProviderForm 与 TestConnectionButton 使用
	const activeProvider =
		providers.find((p) => p.id === activeProviderId) ?? null;

	/**
	 * 选中某个 provider 时触发：更新 activeProviderId，并清除上次保存反馈。
	 * @param id 被选 provider 的 id
	 */
	const handleSelectActive = useCallback((id: string) => {
		setActiveProviderId(id);
		setSaveStatus("idle");
		setSaveError("");
	}, []);

	/**
	 * 删除某个自定义 provider：从 providers 列表移除。
	 * 若被删项正是当前激活项，则清空激活选择。
	 * @param id 被删 provider 的 id
	 */
	const handleDeleteProvider = useCallback((id: string) => {
		setProviders((prev) => prev.filter((p) => p.id !== id));
		setActiveProviderId((cur) => (cur === id ? null : cur));
		setSaveStatus("idle");
		setSaveError("");
	}, []);

	/**
	 * 添加自定义 provider：创建一个空的自定义 ProviderConfig 加入列表，
	 * 并自动选中新项方便用户立即编辑。
	 */
	const handleAddCustom = useCallback(() => {
		const newCustom: ProviderConfig = {
			id: `custom-${Date.now()}`,
			name: "",
			format: "openai",
			baseUrl: "",
			apiKey: "",
			model: "",
			isBuiltIn: false,
			isCustom: true,
		};
		setProviders((prev) => [...prev, newCustom]);
		// 自动选中新建项，方便立即编辑
		setActiveProviderId(newCustom.id);
		setSaveStatus("idle");
		setSaveError("");
	}, []);

	/**
	 * ProviderForm 字段变更回调：用新 provider 替换列表中对应项。
	 * @param next 更新后的完整 ProviderConfig
	 */
	const handleProviderChange = useCallback((next: ProviderConfig) => {
		setProviders((prev) => prev.map((p) => (p.id === next.id ? next : p)));
		setSaveStatus("idle");
		setSaveError("");
	}, []);

	/**
	 * 保存按钮提交处理（form onSubmit）。
	 *
	 * 三态反馈流程（设计依据 3.5 §5）：
	 * 1. 进入 saving 态，按钮禁用
	 * 2. 调 saveBiliAgentSettings 持久化
	 * 3. 成功 -> onSaved 回调 + saved 态（2s 后回 idle）
	 * 4. 失败 -> error 态 + 显示错误信息
	 *
	 * MV3 origin 授权（P5 新增）：
	 * - 必须在 onClick 同步栈内调 chrome.permissions.request（用户手势上下文）。
	 *   因此本函数在 await saveBiliAgentSettings 之前先同步遍历自定义 provider
	 *   申请权限。Chrome 允许在 onClick 同步链中 await permissions.request。
	 * - 仅对非内置域名申请（内置域名已在 host_permissions 中授权）。
	 * - 用户拒绝 / API 异常 -> error 态 + 错误提示 "需要授权访问该域名"，
	 *   且不调 saveBiliAgentSettings（不留半保存），不调 onSaved。
	 *
	 * @param e 表单提交事件
	 */
	const handleSave = useCallback(
		async (e: FormEvent<HTMLFormElement>) => {
			e.preventDefault();
			setSaveStatus("saving");
			setSaveError("");

			// ---- MV3 origin 授权：必须在用户手势同步栈内完成 ----
			// 先同步收集所有需要申请的 origin pattern，再一次性批量请求权限。
			// 这是因为 chrome.permissions.request 的 origins 参数本身支持数组，
			// 批量请求可避免 for...of 中第一个 await 后脱离用户手势同步栈的问题。
			const patterns: string[] = [];
			for (const provider of providers) {
				// 仅自定义 provider 需要申请（内置 provider 已在 host_permissions 中）
				if (!provider.isCustom) {
					continue;
				}
				// baseUrl 为空的自定义 provider 跳过，让后续 saveBiliAgentSettings 自然失败
				const baseUrl = provider.baseUrl;
				if (baseUrl.trim() === "") {
					continue;
				}
				// 内置域名（如 api.openai.com）已在 host_permissions 中，跳过
				if (isBuiltInProviderOrigin(baseUrl)) {
					continue;
				}
				// 解析最小 origin 通配 pattern；解析失败（空串）跳过
				const pattern = resolveOriginPattern(baseUrl);
				if (pattern === "") {
					continue;
				}
				patterns.push(pattern);
			}
			// 在用户手势同步栈内一次性申请所有权限
			if (patterns.length > 0) {
				try {
					const granted = await chrome.permissions.request({
						origins: patterns,
					});
					if (!granted) {
						// 用户拒绝授权：渲染错误提示，不保存，不触发 onSaved
						setSaveError("需要授权访问该域名");
						setSaveStatus("error");
						return;
					}
				} catch {
					// Chrome API 抛异常：同样渲染错误提示，不保存
					setSaveError("需要授权访问该域名");
					setSaveStatus("error");
					return;
				}
			}

			try {
				const next: BiliAgentSettings = {
					providers,
					activeProviderId,
					themeMode,
				};
				// 复用现有 saveBiliAgentSettings（内部用 chrome.storage.local.set）
				const saved = await saveBiliAgentSettings(next);
				onSaved(saved);
				setSaveStatus("saved");
				// saved 态 2s 后回到 idle，避免长期停留在已保存态
				setTimeout(() => {
					setSaveStatus("idle");
				}, 2000);
			} catch (err) {
				setSaveError(err instanceof Error ? err.message : String(err));
				setSaveStatus("error");
			}
		},
		[providers, activeProviderId, themeMode, onSaved],
	);

	// ---- 内联样式（CONSTRAINT: 不用 className） ----
	const rootStyle: CSSProperties = {
		position: "relative",
		width: "100%",
		height: "100%",
		maxHeight: "100%",
		overflowY: "auto",
		display: "flex",
		flexDirection: "column",
		background: "var(--bili-bg-white)",
		pointerEvents: "auto",
	};
	const headerStyle: CSSProperties = {
		padding: "10px 16px",
		borderBottom: "1px solid var(--bili-border)",
		fontWeight: 600,
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",
	};
	const closeBtnStyle: CSSProperties = {
		background: "transparent",
		border: "none",
		fontSize: 18,
		cursor: "pointer",
		color: "var(--bili-text-secondary)",
		padding: "0 6px",
	};
	const tabBarStyle: CSSProperties = {
		display: "flex",
		borderBottom: "1px solid var(--bili-border)",
	};
	const tabBtnBase: CSSProperties = {
		flex: 1,
		padding: "8px 0",
		border: "none",
		background: "transparent",
		cursor: "pointer",
		fontSize: 13,
	};
	const tabBtnActive: CSSProperties = {
		...tabBtnBase,
		borderBottom: "2px solid var(--bili-pink)",
		color: "var(--bili-pink)",
		fontWeight: 600,
	};
	const tabBtnInactive: CSSProperties = {
		...tabBtnBase,
		borderBottom: "2px solid transparent",
		color: "var(--bili-text-secondary)",
	};
	const formStyle: CSSProperties = {
		padding: 16,
		display: "flex",
		flexDirection: "column",
		gap: 12,
	};
	const fieldRowStyle: CSSProperties = {
		display: "flex",
		flexDirection: "column",
		gap: 4,
	};
	const labelStyle: CSSProperties = {
		fontSize: 13,
		color: "var(--bili-text-primary)",
	};
	const inputStyle: CSSProperties = {
		padding: "6px 8px",
		border: "1px solid var(--bili-border)",
		borderRadius: 4,
		fontSize: 13,
		width: "100%",
		boxSizing: "border-box",
	};
	const footerStyle: CSSProperties = {
		display: "flex",
		gap: 8,
		alignItems: "center",
	};
	const saveBtnStyle: CSSProperties = {
		padding: "6px 14px",
		background: saveStatus === "saving" ? "var(--bili-gray-mid)" : "var(--bili-pink)",
		color: "var(--bili-bg-white)",
		border: "none",
		borderRadius: 6,
		cursor: saveStatus === "saving" ? "not-allowed" : "pointer",
		fontSize: 13,
	};
	const closeFooterBtnStyle: CSSProperties = {
		padding: "6px 14px",
		background: "var(--bili-bg-soft)",
		color: "var(--bili-text-primary)",
		border: "1px solid var(--bili-border)",
		borderRadius: 6,
		cursor: "pointer",
		fontSize: 13,
	};
	const savedHintStyle: CSSProperties = {
		fontSize: 12,
		marginLeft: "auto",
		color: saveStatus === "error" ? "var(--bili-red)" : "var(--bili-green)",
	};

	// 保存按钮文案根据三态反馈切换
	const saveBtnText =
		saveStatus === "saving"
			? "⟳ 保存中..."
			: saveStatus === "saved"
				? "✓ 已保存"
				: saveStatus === "error"
					? "✕ 错误"
					: "保存";

	return (
		<div style={rootStyle} data-testid="settings-panel">
			{/* 顶部标题栏 + 关闭按钮 */}
			<div style={headerStyle}>
				<span>设置</span>
				<button
					type="button"
					onClick={onClose}
					style={closeBtnStyle}
					aria-label="关闭设置"
					data-testid="settings-close-btn"
				>
					×
				</button>
			</div>

			{/* Tab 切换栏：通用 / 模型 */}
			<div style={tabBarStyle} role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "general"}
					style={activeTab === "general" ? tabBtnActive : tabBtnInactive}
					onClick={() => setActiveTab("general")}
					data-testid="tab-general"
				>
					通用
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "model"}
					style={activeTab === "model" ? tabBtnActive : tabBtnInactive}
					onClick={() => setActiveTab("model")}
					data-testid="tab-model"
				>
					模型
				</button>
			</div>

			{/* 保存表单：两 Tab 共用同一 form，保存时一并提交所有字段 */}
			<form onSubmit={handleSave} style={formStyle}>
				{activeTab === "general" ? (
					/* 通用 Tab：主题模式下拉，仅维护内部 themeMode state，不立即保存 */
					<div style={fieldRowStyle} data-testid="general-tab-content">
						<label style={labelStyle} htmlFor="settings-theme-mode">
							主题模式
						</label>
						<select
							id="settings-theme-mode"
							style={inputStyle}
							value={themeMode}
							onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
							aria-label="主题模式"
							data-testid="theme-mode-select"
						>
							{THEME_MODE_OPTIONS.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
					</div>
				) : (
					/* 模型 Tab：ProviderList + 选中时 ProviderForm + TestConnectionButton */
					<div data-testid="model-tab-content">
						<ProviderList
							providers={providers}
							activeProviderId={activeProviderId}
							onSelectActive={handleSelectActive}
							onDelete={handleDeleteProvider}
							onAddCustom={handleAddCustom}
						/>
						{/* 选中某个 provider 时渲染其表单与连接测试按钮 */}
						{activeProvider && (
							<div style={{ marginTop: 12 }}>
								<ProviderForm
									provider={activeProvider}
									onChange={handleProviderChange}
								/>
								{/* TestConnectionButton 接收 SettingsPanel props 的 port（SA-12 经单 Port） */}
								<div style={{ marginTop: 8 }}>
									{/* Provider 配置变化时重挂载，避免旧测试状态残留到新配置。 */}
									<TestConnectionButton
										key={JSON.stringify(activeProvider)}
										provider={activeProvider}
										port={port}
									/>
								</div>
							</div>
						)}
						{/* R7 风险提示：API Key 明文存储（设计依据 4.5 §2.3 R7） */}
						<div
							style={{
								marginTop: 16,
								padding: "8px 10px",
								background: "var(--bili-bg-warning)",
								border: "1px solid var(--bili-border-warning)",
								borderRadius: 4,
								fontSize: 11,
								color: "var(--bili-text-system)",
								lineHeight: 1.5,
							}}
							role="note"
							data-testid="api-key-risk-hint"
						>
							API Key 以明文存储在本地，建议定期轮换并设置用量限额
						</div>
					</div>
				)}

				{/* 底部保存/关闭按钮 + 三态反馈 */}
				<div style={footerStyle}>
					<button
						type="submit"
						disabled={saveStatus === "saving"}
						style={saveBtnStyle}
						data-testid="save-button"
					>
						{saveBtnText}
					</button>
					<button
						type="button"
						onClick={onClose}
						style={closeFooterBtnStyle}
						data-testid="cancel-button"
					>
						取消
					</button>
					{/* saved 态显示"已保存"，error 态显示错误信息 */}
					{saveStatus === "saved" && (
						<span style={savedHintStyle} data-testid="save-success-hint">
							已保存
						</span>
					)}
					{saveStatus === "error" && (
						<span
							style={savedHintStyle}
							role="alert"
							data-testid="save-error-hint"
						>
							{saveError}
						</span>
					)}
				</div>
			</form>
		</div>
	);
}
