import type React from "react";
import { useCallback, useState } from "react";
import type {
	ApiFormat,
	ProviderConfig,
} from "../../lib/shared-types/provider.js";

/** ProviderForm 组件的 props 定义 */
export interface ProviderFormProps {
	/** 当前要编辑的 provider 配置 */
	provider: ProviderConfig;
	/** 字段变更回调，传入更新后的完整 ProviderConfig */
	onChange: (next: ProviderConfig) => void;
}

/** 可选的 API 协议格式列表，对应 openai / anthropic / gemini 三种主流协议 */
const FORMAT_OPTIONS: readonly ApiFormat[] = ["openai", "anthropic", "gemini"];

/** 按 format 提供的 Base URL 占位提示，辅助用户填写 */
const BASE_URL_PLACEHOLDERS: Record<ApiFormat, string> = {
	openai: "https://api.openai.com/v1",
	anthropic: "https://api.anthropic.com/v1",
	gemini: "https://generativelanguage.googleapis.com/v1beta",
};

/** 每个字段的 key 类型，用于 touched 状态索引 */
type FieldKey = "name" | "format" | "baseUrl" | "apiKey" | "model";

/** touched 状态记录：哪些字段已被用户交互过（onBlur 触发） */
type TouchedState = Partial<Record<FieldKey, boolean>>;

/**
 * 校验给定的 URL 字符串是否合法。
 * 空字符串视为合法（允许留空，由必填校验负责），避免 URL 必填与格式校验混在一起。
 *
 * @param value 待校验的 URL 字符串
 * @returns 合法返回 true，非法返回 false
 */
function isValidUrl(value: string): boolean {
	// 空值不在此处报错，留必填逻辑处理，职责单一
	if (value.trim() === "") {
		return true;
	}
	try {
		// 利用 URL 构造器做格式校验，非法会抛错
		new URL(value);
		return true;
	} catch {
		return false;
	}
}

/**
 * ProviderForm —— 模型提供商配置表单组件。
 *
 * 渲染 5 个字段：name / format / baseUrl / apiKey / model。
 * - 内置 provider（isCustom:false）不渲染 name/format/baseUrl，只渲染 apiKey + model。
 * - 自定义 provider（isCustom:true）渲染全部 5 字段。
 * - 校验采用 touched 模式：字段失焦后才显示错误，避免用户刚开始输入就被报错。
 * - apiKey 校验对 ollama 例外（本地模型无需 key）。
 *
 * 该组件不直接修改外部状态，所有变更通过 onChange 回调上抛。
 */
export function ProviderForm({
	provider,
	onChange,
}: ProviderFormProps): React.ReactElement {
	// 记录每个字段是否已被触碰（失焦），用于延迟显示校验错误
	const [touched, setTouched] = useState<TouchedState>({});

	/**
	 * 标记某字段为已触碰。在字段 onBlur 时调用。
	 * @param key 字段名
	 */
	const markTouched = useCallback((key: FieldKey) => {
		setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
	}, []);

	/**
	 * 更新某个字段的值，并向父组件上抛完整的 next provider。
	 * 泛型 K 保证 key 与 value 类型联动，避免传错类型。
	 *
	 * @param key 要更新的字段名
	 * @param value 新值
	 */
	const updateField = useCallback(
		<K extends FieldKey>(key: K, value: ProviderConfig[K]) => {
			onChange({ ...provider, [key]: value });
		},
		[provider, onChange],
	);

	// ---- 校验状态计算 ----
	// name 必填（仅自定义 provider 才显示该字段）：去空格后不能为空，仅当字段已被触碰时才报错
	const isNameEmpty = provider.isCustom && provider.name.trim() === "";
	// model 必填：去空格后不能为空
	const isModelEmpty = provider.model.trim() === "";
	// baseUrl 格式校验：仅当字段已被触碰时才报错
	const isBaseUrlInvalid =
		Boolean(touched.baseUrl) && !isValidUrl(provider.baseUrl);
	// apiKey 必填（ollama 例外）：仅当字段已被触碰时才报错
	const isApiKeyInvalid =
		Boolean(touched.apiKey) &&
		provider.apiKey.trim() === "" &&
		provider.id !== "ollama";

	return (
		<div
			className="bili-agent-model-settings__provider-card"
			data-testid="provider-form"
		>
			{/* 自定义 provider 才渲染 name / format / baseUrl 三字段 */}
			{provider.isCustom && (
				<>
					{/* 名称字段 */}
					<div className="bili-agent-model-settings__field">
						<label
							className="bili-agent-settings__label"
							htmlFor={`provider-form-name-${provider.id}`}
						>
							名称
						</label>
						<input
							id={`provider-form-name-${provider.id}`}
							className="bili-agent-settings__input"
							type="text"
							aria-label="名称"
							value={provider.name}
							onChange={(e) => updateField("name", e.target.value)}
							onBlur={() => markTouched("name")}
						/>
						{/* name 必填错误提示：仅 touched 后显示 */}
						{Boolean(touched.name) && isNameEmpty && (
							<span
								className="bili-agent-settings__status bili-agent-settings__status--error"
								role="alert"
							>
								名称不能为空
							</span>
						)}
					</div>

					{/* API 协议格式字段 */}
					<div className="bili-agent-model-settings__field">
						<label
							className="bili-agent-settings__label"
							htmlFor={`provider-form-format-${provider.id}`}
						>
							API 格式
						</label>
						<select
							id={`provider-form-format-${provider.id}`}
							className="bili-agent-settings__input"
							aria-label="API 格式"
							value={provider.format}
							onChange={(e) =>
								updateField("format", e.target.value as ApiFormat)
							}
							onBlur={() => markTouched("format")}
						>
							{FORMAT_OPTIONS.map((fmt) => (
								<option key={fmt} value={fmt}>
									{fmt}
								</option>
							))}
						</select>
					</div>

					{/* Base URL 字段：带占位提示与格式校验 */}
					<div className="bili-agent-model-settings__field">
						<label
							className="bili-agent-settings__label"
							htmlFor={`provider-form-baseurl-${provider.id}`}
						>
							Base URL
						</label>
						<input
							id={`provider-form-baseurl-${provider.id}`}
							className="bili-agent-settings__input"
							type="text"
							aria-label="Base URL"
							placeholder={BASE_URL_PLACEHOLDERS[provider.format]}
							value={provider.baseUrl}
							onChange={(e) => updateField("baseUrl", e.target.value)}
							onBlur={() => markTouched("baseUrl")}
						/>
						<span className="bili-agent-settings__hint">
							{BASE_URL_PLACEHOLDERS[provider.format]}
						</span>
						{/* URL 格式错误提示：仅 touched 后显示 */}
						{isBaseUrlInvalid && (
							<span
								className="bili-agent-settings__status bili-agent-settings__status--error"
								role="alert"
							>
								Base URL 格式不合法
							</span>
						)}
					</div>
				</>
			)}

			{/* API Key 字段：始终渲染；ollama 例外提示 */}
			<div className="bili-agent-model-settings__field">
				<label
					className="bili-agent-settings__label"
					htmlFor={`provider-form-apikey-${provider.id}`}
				>
					API Key
				</label>
				<input
					id={`provider-form-apikey-${provider.id}`}
					className="bili-agent-settings__input"
					type="password"
					aria-label="API Key"
					value={provider.apiKey}
					onChange={(e) => updateField("apiKey", e.target.value)}
					onBlur={() => markTouched("apiKey")}
					placeholder={
						provider.id === "ollama" ? "本地模型无需 API Key" : "请输入 API Key"
					}
				/>
				{/* apiKey 必填错误提示（ollama 除外）：仅 touched 后显示 */}
				{isApiKeyInvalid && (
					<span
						className="bili-agent-settings__status bili-agent-settings__status--error"
						role="alert"
					>
						API Key 不能为空
					</span>
				)}
			</div>

			{/* 模型字段：始终渲染 */}
			<div className="bili-agent-model-settings__field">
				<label
					className="bili-agent-settings__label"
					htmlFor={`provider-form-model-${provider.id}`}
				>
					模型
				</label>
				<input
					id={`provider-form-model-${provider.id}`}
					className="bili-agent-settings__input"
					type="text"
					aria-label="模型"
					value={provider.model}
					onChange={(e) => updateField("model", e.target.value)}
					onBlur={() => markTouched("model")}
				/>
				{/* model 必填错误提示：仅 touched 后显示 */}
				{Boolean(touched.model) && isModelEmpty && (
					<span
						className="bili-agent-settings__status bili-agent-settings__status--error"
						role="alert"
					>
						模型不能为空
					</span>
				)}
			</div>
		</div>
	);
}
