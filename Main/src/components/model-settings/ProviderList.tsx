import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProviderConfig } from "../../lib/shared-types/provider.js";

/**
 * ProviderList 组件的 props 定义。
 *
 * 该组件是模型设置面板中的"提供商下拉选择列表"：
 * - 触发按钮显示当前激活的 provider 名称（无激活时显示占位文案）
 * - 点击展开下拉菜单，内置 provider 在上、自定义 provider 在下，中间有分隔线
 * - 当前激活项高亮（--active className）
 * - 自定义 provider 行尾有删除按钮（×），内置 provider 无删除按钮
 * - 点击下拉外部区域自动收起
 * - 尾部"+"按钮触发 onAddCustom 回调
 */
export interface ProviderListProps {
	/** 全部 provider 列表（内置 + 自定义混合传入，组件内部按 isCustom 分组） */
	providers: ProviderConfig[];
	/** 当前激活的 provider id，null 表示尚未选中任何 provider */
	activeProviderId: string | null;
	/** 选中某个 provider 时触发，传入被选 provider 的 id */
	onSelectActive: (id: string) => void;
	/** 删除某个自定义 provider 时触发，传入被删 provider 的 id */
	onDelete: (id: string) => void;
	/** 点击"+"按钮时触发，用于打开新增自定义 provider 表单 */
	onAddCustom: () => void;
}

/**
 * ProviderList -- 提供商下拉选择列表组件。
 *
 * 渲染结构：
 *   根 div[data-testid="provider-list"]
 *     └ selector-row
 *         ├ label "提供商"
 *         ├ custom-dropdown
 *         │   ├ trigger 按钮（显示激活名 / 占位 + ▾ 箭头）
 *         │   └ menu（listbox，展开时渲染）
 *         │       ├ 内置 provider 选项列表
 *         │       ├ 分隔线（仅当存在自定义 provider 时）
 *         │       └ 自定义 provider 选项列表
 *         └ add-btn "+" 按钮
 *
 * 交互行为：
 * - 点击 trigger 切换 isOpen
 * - 选中某项：调 onSelectActive 并收起
 * - 删除某项（仅自定义）：stopPropagation 后调 onDelete 并收起
 * - 点击下拉外部：document mousedown 监听，composedPath 不含容器即收起
 *
 * @param props 组件 props，见 ProviderListProps
 * @returns React 元素
 */
export function ProviderList({
	providers,
	activeProviderId,
	onSelectActive,
	onDelete,
	onAddCustom,
}: ProviderListProps): React.ReactElement {
	// 下拉展开/收起状态
	const [isOpen, setIsOpen] = useState(false);
	// 下拉容器 ref，用于点击外部判定
	const containerRef = useRef<HTMLDivElement>(null);

	// 按 isCustom 将 providers 分为内置与自定义两组，避免每次渲染都遍历
	const { builtInProviders, customProviders } = useMemo(() => {
		const builtIn: ProviderConfig[] = [];
		const custom: ProviderConfig[] = [];
		for (const provider of providers) {
			if (provider.isCustom) {
				custom.push(provider);
			} else {
				builtIn.push(provider);
			}
		}
		return { builtInProviders: builtIn, customProviders: custom };
	}, [providers]);

	// 查找当前激活的 provider 对象，用于 trigger 按钮显示名称
	const activeProvider = useMemo(
		() =>
			providers.find((provider) => provider.id === activeProviderId) ?? null,
		[providers, activeProviderId],
	);

	// 点击外部收起下拉：仅当 isOpen 时挂载 document mousedown 监听
	// 用 composedPath 判定点击是否发生在容器内部（含 Shadow DOM 边界）
	useEffect(() => {
		if (!isOpen) return;

		const handlePointerDown = (event: MouseEvent) => {
			if (!containerRef.current) return;
			// composedPath 覆盖 Shadow DOM 场景，点击路径包含容器则不收起
			if (event.composedPath().includes(containerRef.current)) return;
			setIsOpen(false);
		};

		document.addEventListener("mousedown", handlePointerDown);
		return () => document.removeEventListener("mousedown", handlePointerDown);
	}, [isOpen]);

	/**
	 * 选中某个 provider：触发回调并收起下拉。
	 * @param providerId 被选 provider 的 id
	 */
	const handleSelect = useCallback(
		(providerId: string) => {
			onSelectActive(providerId);
			setIsOpen(false);
		},
		[onSelectActive],
	);

	/**
	 * 删除某个自定义 provider：阻止冒泡（避免触发选中），触发回调并收起下拉。
	 *
	 * @param event 鼠标事件，用于 stopPropagation
	 * @param providerId 被删 provider 的 id
	 */
	const handleDelete = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>, providerId: string) => {
			event.stopPropagation();
			onDelete(providerId);
			setIsOpen(false);
		},
		[onDelete],
	);

	/**
	 * 渲染单个 provider 选项行。
	 * - 激活项追加 --active className 高亮
	 * - 自定义 provider 渲染删除按钮（×），内置不渲染
	 *
	 * @param provider 单个 provider 配置
	 * @returns 选项行 li 元素
	 */
	const renderItem = (provider: ProviderConfig) => {
		const isActive = provider.id === activeProviderId;
		// 拼接 className：基础项 + 激活态高亮（如有）
		const itemClassName = [
			"bili-agent-model-settings__custom-dropdown-item",
			isActive ? "bili-agent-model-settings__custom-dropdown-item--active" : "",
		]
			.filter(Boolean)
			.join(" ");

		return (
			<li key={provider.id} role="none" data-testid="provider-option">
				<div
					className={itemClassName}
					role="option"
					tabIndex={0}
					aria-selected={isActive}
				>
					{/* provider 名称按钮：点击选中该项 */}
					<button
						type="button"
						className="bili-agent-model-settings__custom-dropdown-item-name"
						onClick={() => handleSelect(provider.id)}
						aria-label={`选择 ${provider.name}`}
					>
						{provider.name}
					</button>
					{/* 仅自定义 provider 渲染删除按钮 */}
					{provider.isCustom && (
						<button
							type="button"
							className="bili-agent-model-settings__custom-dropdown-item-delete"
							onClick={(event) => handleDelete(event, provider.id)}
							aria-label={`删除 ${provider.name}`}
						>
							×
						</button>
					)}
				</div>
			</li>
		);
	};

	return (
		<div className="bili-agent-model-settings" data-testid="provider-list">
			<div className="bili-agent-model-settings__selector-row">
				{/* 提供商标签 */}
				<span
					className="bili-agent-settings__label"
					id="bili-agent-provider-selector-label"
				>
					提供商
				</span>
				{/* 自定义下拉容器：ref 用于点击外部判定 */}
				<div
					ref={containerRef}
					className="bili-agent-model-settings__custom-dropdown"
				>
					{/* 触发按钮：显示激活名/占位 + ▾ 箭头，点击切换展开 */}
					<button
						type="button"
						className="bili-agent-model-settings__custom-dropdown-trigger"
						aria-haspopup="listbox"
						aria-expanded={isOpen}
						aria-label="选择提供商"
						data-testid="provider-dropdown-trigger"
						onClick={() => setIsOpen((open) => !open)}
					>
						<span className="bili-agent-model-settings__custom-dropdown-trigger-text">
							{activeProvider ? activeProvider.name : "请选择提供商"}
						</span>
						<span
							className="bili-agent-model-settings__custom-dropdown-trigger-caret"
							aria-hidden="true"
						>
							▾
						</span>
					</button>
					{/* 下拉菜单：仅展开时渲染，内置在上、分隔线、自定义在下 */}
					{isOpen && (
						<div
							className="bili-agent-model-settings__custom-dropdown-menu"
							role="listbox"
							aria-label="提供商列表"
						>
							{builtInProviders.map(renderItem)}
							{/* 仅当存在自定义 provider 时渲染分隔线 */}
							{customProviders.length > 0 && (
								<hr className="bili-agent-model-settings__custom-divider" />
							)}
							{customProviders.map(renderItem)}
						</div>
					)}
				</div>
				{/* "+" 添加自定义提供商按钮 */}
				<button
					type="button"
					className="bili-agent-model-settings__add-btn"
					onClick={onAddCustom}
					aria-label="添加自定义提供商"
				>
					+
				</button>
			</div>
		</div>
	);
}
