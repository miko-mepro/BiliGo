/**
 * CSP-safe stylesheet using Constructable Stylesheets (adoptedStyleSheets).
 * No inline <style> tags — all styles are injected via CSSStyleSheet objects.
 */

const css = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Microsoft YaHei", sans-serif;
  }

  /* Toggle Button - 哔哩哔哩粉色风格 */
  .bili-agent-toggle {
    pointer-events: auto;
    position: fixed;
    top: 50%;
    right: -16px;
    z-index: 10001;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: none;
    background: linear-gradient(135deg, #FB7299 0%, #F25D8E 100%);
    color: #FFFFFF;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 600;
    box-shadow: 0 4px 16px rgba(251, 114, 153, 0.35);
    transition: opacity 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
    transform: translateY(-50%) scale(0.7);
    will-change: transform;
    opacity: 0.95;
    outline: none;
    padding: 0;
    margin: 0;
    letter-spacing: 0;
  }

  .bili-agent-toggle:hover {
    transform: translateY(-50%) scale(0.85);
    opacity: 1;
    box-shadow: 0 6px 24px rgba(251, 114, 153, 0.45);
  }

  .bili-agent-toggle:active {
    transform: translateY(-50%) scale(0.78);
  }

  .bili-agent-toggle--open {
    display: none;
    background: linear-gradient(135deg, #00A1D6 0%, #0091C2 100%);
    box-shadow: 0 4px 16px rgba(0, 161, 214, 0.35);
  }

  /* Panel - 哔哩哔哩风格面板 */
  .bili-agent-panel {
    --bili-agent-panel-origin-x: 100%;
    --bili-agent-panel-origin-y: 0%;
    position: fixed;
    top: 40px;
    right: 16px;
    width: 380px;
    height: auto;
    max-height: calc(100vh - 80px);
    bottom: 40px;
    background-color: #F4F5F7;
    box-shadow: 0 0 0 rgba(251, 114, 153, 0);
    z-index: 10000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 16px;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translate3d(0, 0, 0) scale(0.08);
    transform-origin: var(--bili-agent-panel-origin-x) var(--bili-agent-panel-origin-y);
    clip-path: circle(0% at var(--bili-agent-panel-origin-x) var(--bili-agent-panel-origin-y));
    filter: blur(8px) saturate(1.15);
    backface-visibility: hidden;
    contain: layout paint style;
    will-change: transform, opacity, clip-path;
    transition:
      transform 0.26s cubic-bezier(0.34, 0, 0.2, 1),
      opacity 0.2s ease,
      clip-path 0.26s cubic-bezier(0.34, 0, 0.2, 1),
      filter 0.22s ease,
      box-shadow 0.26s ease,
      visibility 0s linear 0.35s;
  }

  .bili-agent-panel--open {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translate3d(0, 0, 0) scale(1);
    clip-path: circle(150% at var(--bili-agent-panel-origin-x) var(--bili-agent-panel-origin-y));
    filter: blur(0) saturate(1);
    box-shadow: -6px 0 32px rgba(0, 0, 0, 0.12), 0 0 36px rgba(251, 114, 153, 0.14);
    transition:
      transform 0.34s cubic-bezier(0.16, 1, 0.3, 1),
      opacity 0.18s ease,
      clip-path 0.34s cubic-bezier(0.16, 1, 0.3, 1),
      filter 0.2s ease,
      box-shadow 0.34s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .bili-agent-panel,
    .bili-agent-panel--open {
      transition: none;
    }

    .bili-agent-panel {
      transform: none;
      clip-path: none;
      filter: none;
    }
  }

  /* Panel Header - 哔哩哔哩渐变头部 */
  .bili-agent-panel__header {
    padding: 18px 20px;
    border-bottom: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: linear-gradient(135deg, #FB8DA0 0%, #F06E8A 100%);
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(251, 114, 153, 0.15);
    position: relative;
  }

  .bili-agent-panel__heading {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
  }

  .bili-agent-panel__title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #FFFFFF;
    line-height: 1.4;
  }

  .bili-agent-panel__badge {
    font-size: 11px;
    color: #FFFFFF;
    background-color: rgba(255, 255, 255, 0.25);
    padding: 3px 10px;
    border-radius: 12px;
    font-weight: 500;
  }

  .bili-agent-panel__settings-button,
  .bili-agent-panel__close-button {
    width: 32px;
    min-width: 32px;
    height: 32px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 16px;
    background-color: rgba(255, 255, 255, 0.15);
    color: #FFFFFF;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 0;
    margin: 0;
    flex-shrink: 0;
    font-weight: 500;
    backdrop-filter: blur(10px);
    transition: all 0.25s ease;
  }

  .bili-agent-panel__settings-button:hover,
  .bili-agent-panel__close-button:hover {
    background-color: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.5);
    transform: translateY(-1px);
  }

  .bili-agent-panel__settings-button {
    margin-right: 20px;
  }

  .bili-agent-panel__settings-button--active {
    background-color: #FFFFFF;
    color: #FB7299;
    border-color: #FFFFFF;
  }

  .bili-agent-panel__settings-label {
    font-size: 13px;
    line-height: 1;
  }

  /* Panel Content */
  .bili-agent-panel__content {
    flex: 1;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
  }

  .bili-agent-panel__search {
    padding: 12px 16px;
    background-color: #FFFFFF;
    border-radius: 20px;
    border: 1px solid #E5E9EF;
    color: #9499A0;
    font-size: 14px;
    cursor: text;
    user-select: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
  }

  .bili-agent-panel__welcome {
    padding: 14px 16px;
    background: linear-gradient(135deg, #FFF5F7 0%, #FFF8FA 100%);
    border-radius: 12px;
    border-left: 3px solid #FB7299;
    box-shadow: 0 2px 8px rgba(251, 114, 153, 0.08);
  }

  .bili-agent-panel__welcome-text {
    margin: 0;
    font-size: 13px;
    color: #61666D;
    line-height: 1.7;
  }

  /* Panel Footer */
  .bili-agent-panel__footer {
    padding: 12px 20px;
    border-top: 1px solid #E5E9EF;
    background-color: #FAFBFC;
    font-size: 12px;
    color: #9499A0;
    text-align: center;
    flex-shrink: 0;
    display: none;
  }

  .bili-agent-panel__footer--visible {
    display: block;
  }

  /* Panel Chat Container */
  .bili-agent-panel__chat {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .bili-agent-panel__input {
    padding: 12px 16px;
    border-top: 1px solid #E5E9EF;
    background-color: #FFFFFF;
    flex-shrink: 0;
  }

  /* Settings - 哔哩哔哩设置面板 */
  .bili-agent-settings {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background-color: #F4F5F7;
  }

  .bili-agent-settings__topbar {
    flex-shrink: 0;
    padding: 16px;
    border-bottom: 1px solid #E5E9EF;
    background-color: #FFFFFF;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .bili-agent-settings__title {
    margin: 0;
    color: #18191C;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.4;
  }

  .bili-agent-settings__tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    padding: 4px;
    border-radius: 12px;
    background-color: #F4F5F7;
  }

  .bili-agent-settings__tab {
    width: 100%;
    min-width: 0;
    height: 36px;
    border: 0;
    border-radius: 10px;
    background-color: transparent;
    color: #61666D;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    line-height: 1;
    padding: 0 12px;
    transition: all 0.25s ease;
  }

  .bili-agent-settings__tab:hover {
    color: #FB7299;
  }

  .bili-agent-settings__tab--active {
    background-color: #FFFFFF;
    color: #FB7299;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .bili-agent-settings__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .bili-agent-settings__section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    background-color: #FFFFFF;
    padding: 16px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .bili-agent-settings__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .bili-agent-settings__label,
  .bili-agent-settings__toggle-label {
    font-size: 14px;
    font-weight: 500;
    color: #18191C;
  }

  .bili-agent-settings__input {
    width: 100%;
    box-sizing: border-box;
    height: 38px;
    border: 1px solid #E5E9EF;
    border-radius: 8px;
    background-color: #F4F5F7;
    color: #18191C;
    font-family: inherit;
    font-size: 14px;
    padding: 8px 12px;
    outline: none;
    transition: all 0.25s ease;
  }

  .bili-agent-settings__input:focus {
    border-color: #FB7299;
    background-color: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(251, 114, 153, 0.1);
  }

  .bili-agent-settings__input:disabled {
    color: #9499A0;
    background-color: #F6F7F8;
  }

  .bili-agent-settings__toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 32px;
    cursor: pointer;
  }

  .bili-agent-settings__checkbox {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: #FB7299;
    cursor: pointer;
  }

  .bili-agent-settings__status {
    min-height: 20px;
    color: #00A65A;
    font-size: 12px;
  }

  .bili-agent-settings__status--error {
    color: #FF6B81;
  }

  .bili-agent-settings__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 16px;
    border-top: 1px solid #E5E9EF;
    background-color: #FFFFFF;
    flex-shrink: 0;
  }

  .bili-agent-settings__button {
    height: 36px;
    min-width: 80px;
    border: none;
    border-radius: 18px;
    background: linear-gradient(135deg, #FB7299 0%, #F25D8E 100%);
    color: #FFFFFF;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    padding: 0 20px;
    transition: all 0.25s ease;
    box-shadow: 0 2px 8px rgba(251, 114, 153, 0.3);
  }

  .bili-agent-settings__button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(251, 114, 153, 0.4);
  }

  .bili-agent-settings__button:active:not(:disabled) {
    transform: translateY(0);
  }

  .bili-agent-settings__button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .bili-agent-settings__button--secondary {
    border: 1px solid #E5E9EF;
    background: #FFFFFF;
    color: #61666D;
    box-shadow: none;
  }

  .bili-agent-settings__button--secondary:hover:not(:disabled) {
    border-color: #FB7299;
    color: #FB7299;
    background-color: #FFF5F7;
    box-shadow: none;
  }

  /* Message List */
  .bili-agent-message-list {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
  }

  .bili-agent-message-list__empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px 20px;
    color: #9499A0;
  }

  .bili-agent-message-list__empty-icon {
    margin-bottom: 16px;
    color: #E5E9EF;
  }

  .bili-agent-message-list__empty-text {
    font-size: 16px;
    font-weight: 500;
    color: #18191C;
    margin: 0 0 8px;
  }

  .bili-agent-message-list__empty-hint {
    font-size: 13px;
    color: #9499A0;
    margin: 0;
    line-height: 1.6;
  }

  .bili-agent-message-list__messages {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Chat Message - 哔哩哔哩消息气泡 */
  .bili-agent-message {
    display: flex;
    gap: 12px;
    max-width: 100%;
  }

  .bili-agent-message--user {
    flex-direction: row-reverse;
  }

  .bili-agent-message__avatar {
    flex-shrink: 0;
  }

  .bili-agent-message__avatar-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }

  .bili-agent-message__avatar-icon--user {
    background: linear-gradient(135deg, #FB7299 0%, #F25D8E 100%);
    color: #FFFFFF;
    box-shadow: 0 2px 8px rgba(251, 114, 153, 0.25);
  }

  .bili-agent-message__avatar-icon--assistant {
    background: linear-gradient(135deg, #00A1D6 0%, #0091C2 100%);
    color: #FFFFFF;
    box-shadow: 0 2px 8px rgba(0, 161, 214, 0.25);
  }

  .bili-agent-message__avatar-icon--system {
    background-color: #FFF7E6;
    color: #FA8C16;
  }

  .bili-agent-message__content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: calc(100% - 50px);
  }

  .bili-agent-message--user .bili-agent-message__content {
    align-items: flex-end;
  }

  .bili-agent-message__bubble {
    padding: 12px 16px;
    border-radius: 16px;
    font-size: 14px;
    line-height: 1.6;
    word-wrap: break-word;
    white-space: pre-wrap;
  }

  .bili-agent-message--user .bili-agent-message__bubble {
    background: linear-gradient(135deg, #FB7299 0%, #F25D8E 100%);
    color: #FFFFFF;
    border-bottom-right-radius: 4px;
    box-shadow: 0 2px 8px rgba(251, 114, 153, 0.2);
  }

  .bili-agent-message--assistant .bili-agent-message__bubble {
    background-color: #FFFFFF;
    color: #18191C;
    border-bottom-left-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .bili-agent-message--system .bili-agent-message__bubble {
    background-color: #FFF7E6;
    color: #8B6914;
    border: 1px solid #FFE7BA;
  }

  .bili-agent-message__text {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
  }

  .bili-agent-message__time {
    font-size: 11px;
    color: #9499A0;
  }

  .bili-agent-message--user .bili-agent-message__time {
    text-align: right;
  }

  /* Thinking Process (collapsible) */
  .bili-agent-thinking {
    background-color: #F8F9FA;
    border: 1px solid #E5E9EF;
    border-radius: 12px;
    overflow: hidden;
  }

  .bili-agent-thinking__toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    border: 0;
    background: transparent;
    padding: 8px 12px;
    cursor: pointer;
    color: #61666D;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.4;
    text-align: left;
  }

  .bili-agent-thinking__toggle:hover {
    background-color: #FFF5F7;
    color: #FB7299;
  }

  .bili-agent-thinking__caret {
    display: inline-block;
    flex-shrink: 0;
    font-size: 10px;
    transition: transform 0.2s ease;
  }

  .bili-agent-thinking__caret--open {
    transform: rotate(90deg);
  }

  .bili-agent-thinking__title {
    font-weight: 500;
  }

  .bili-agent-thinking__title--live {
    animation: bili-agent-fade-pulse 1.6s ease-in-out infinite;
  }

  .bili-agent-thinking__hint {
    margin-left: auto;
    flex-shrink: 0;
    color: #9499A0;
    font-size: 11px;
  }

  .bili-agent-thinking__body {
    padding: 8px 12px 10px;
    border-top: 1px dashed #E5E9EF;
    color: #9499A0;
    font-size: 12px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 240px;
    overflow-y: auto;
  }

  /* Tool Activity Steps */
  .bili-agent-message__steps {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .bili-agent-message__step {
    display: flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    max-width: 100%;
    padding: 5px 10px;
    border-radius: 10px;
    background-color: #F1F2F3;
    color: #61666D;
    font-size: 12px;
    line-height: 1.4;
  }

  .bili-agent-message__step svg {
    flex-shrink: 0;
    color: #FB7299;
  }

  /* Running Indicator (below assistant bubble) */
  .bili-agent-running {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
  }

  .bili-agent-running__dots {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .bili-agent-running__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: linear-gradient(135deg, #FB7299 0%, #F25D8E 100%);
    opacity: 0.25;
    animation: bili-agent-fade-pulse 1.2s ease-in-out infinite;
  }

  .bili-agent-running__dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .bili-agent-running__dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  .bili-agent-running__label {
    color: #9499A0;
    font-size: 12px;
  }

  @keyframes bili-agent-fade-pulse {
    0%, 100% {
      opacity: 0.25;
    }
    50% {
      opacity: 1;
    }
  }

  /* Chat Input - 哔哩哔哩圆角输入框 */
  .bili-agent-chat-input {
    width: 100%;
  }

  .bili-agent-chat-input__container {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    transition: all 0.25s ease;
  }

  .bili-agent-chat-input__container:focus-within {
    box-shadow: 0 0 0 3px rgba(251, 114, 153, 0.1);
  }

  .bili-agent-chat-input__textarea {
    flex: 1;
    border: none;
    background-color: #FFFFFF;
    resize: none;
    outline: none;
    font-size: 14px;
    line-height: 1.6;
    color: #18191C;
    max-height: 120px;
    min-height: 22px;
    font-family: inherit;
    padding: 8px 12px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .bili-agent-chat-input__textarea::placeholder {
    color: #9499A0;
  }

  .bili-agent-chat-input__textarea:disabled {
    opacity: 0.6;
  }

  .bili-agent-chat-input__send {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: linear-gradient(135deg, #FB7299 0%, #F25D8E 100%);
    color: #FFFFFF;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.25s ease;
    box-shadow: 0 2px 8px rgba(251, 114, 153, 0.3);
  }

  .bili-agent-chat-input__send:hover:not(:disabled) {
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(251, 114, 153, 0.4);
  }

  .bili-agent-chat-input__send:active:not(:disabled) {
    transform: scale(1.05);
  }

  .bili-agent-chat-input__send:disabled {
    background: linear-gradient(135deg, #C9CCD0 0%, #B8BCC2 100%);
    cursor: not-allowed;
    box-shadow: none;
  }

  .bili-agent-chat-input__send--stop {
    background: linear-gradient(135deg, #FB7299 0%, #F25D8E 100%);
  }

  .bili-agent-chat-input__stop-icon {
    display: block;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background-color: #FFFFFF;
  }

  /* Error Display - 哔哩哔哩错误提示 */
  .bili-agent-error {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 18px;
    border-radius: 12px;
    margin: 12px 16px;
    animation: bili-agent-error-in 0.3s ease;
  }

  @keyframes bili-agent-error-in {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .bili-agent-error--rate-limit {
    background-color: #FFF7E6;
    border: 1px solid #FFE7BA;
    color: #FA8C16;
  }

  .bili-agent-error--network {
    background-color: #FFF1F0;
    border: 1px solid #FFCCC7;
    color: #FF6B81;
  }

  .bili-agent-error__icon {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .bili-agent-error__content {
    flex: 1;
  }

  .bili-agent-error__title {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 4px;
  }

  .bili-agent-error__message {
    font-size: 13px;
    margin: 0;
    opacity: 0.9;
  }

  .bili-agent-error__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .bili-agent-error__retry {
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 500;
    border: none;
    border-radius: 16px;
    background-color: currentColor;
    color: inherit;
    cursor: pointer;
    opacity: 0.15;
    transition: all 0.25s ease;
  }

  .bili-agent-error--rate-limit .bili-agent-error__retry {
    background-color: #FA8C16;
    color: #FFFFFF;
    opacity: 1;
  }

  .bili-agent-error--network .bili-agent-error__retry {
    background-color: #FF6B81;
    color: #FFFFFF;
    opacity: 1;
  }

  .bili-agent-error__retry:hover {
    opacity: 0.85;
    transform: translateY(-1px);
  }

  .bili-agent-error__dismiss {
    width: 26px;
    height: 26px;
    border: none;
    background: transparent;
    color: currentColor;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    opacity: 0.6;
    transition: all 0.2s ease;
  }

  .bili-agent-error__dismiss:hover {
    opacity: 1;
    background-color: rgba(0, 0, 0, 0.06);
  }

  /* Video Card - 哔哩哔哩视频卡片 */
  .bili-agent-video-card {
    display: flex;
    flex-direction: column;
    width: 100%;
    border: none;
    background: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    text-align: left;
    border-radius: 12px;
    overflow: hidden;
    background-color: #FFFFFF;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .bili-agent-video-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 6px 20px rgba(251, 114, 153, 0.15);
  }

  .bili-agent-video-card:focus {
    outline: 2px solid #FB7299;
    outline-offset: 2px;
  }

  .bili-agent-video-card__cover {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    background-color: #E5E9EF;
  }

  .bili-agent-video-card__cover-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.3s ease;
  }

  .bili-agent-video-card:hover .bili-agent-video-card__cover-img {
    transform: scale(1.05);
  }

  .bili-agent-video-card__cover-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #F4F5F7 0%, #E5E9EF 100%);
    color: #9499A0;
    font-size: 14px;
  }

  .bili-agent-video-card__duration {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background-color: rgba(0, 0, 0, 0.75);
    color: #FFFFFF;
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 4px;
    font-weight: 600;
    backdrop-filter: blur(4px);
  }

  .bili-agent-video-card__info {
    padding: 12px 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .bili-agent-video-card__title {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: #18191C;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: break-all;
  }

  .bili-agent-video-card__title strong {
    color: #FB7299;
    font-weight: 600;
  }

  .bili-agent-video-card__meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bili-agent-video-card__author {
    font-size: 12px;
    color: #9499A0;
  }

  .bili-agent-video-card__stats {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .bili-agent-video-card__stat {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #9499A0;
  }

  .bili-agent-video-card__stat svg {
    flex-shrink: 0;
  }

  /* Video Card Grid (for MessageList) */
  .bili-agent-video-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
    padding: 8px 0;
  }

  /* Filter Sort Controls - 哔哩哔哩筛选控件 */
  .bili-agent-filter-sort {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    flex-wrap: wrap;
  }

  .bili-agent-filter-sort__group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .bili-agent-filter-sort__label {
    font-size: 13px;
    color: #9499A0;
    white-space: nowrap;
  }

  .bili-agent-filter-sort__select {
    padding: 6px 12px;
    font-size: 13px;
    border: 1px solid #E5E9EF;
    border-radius: 8px;
    background-color: #FFFFFF;
    color: #18191C;
    cursor: pointer;
    outline: none;
    font-family: inherit;
    transition: all 0.25s ease;
  }

  .bili-agent-filter-sort__select:hover {
    border-color: #FB7299;
    background-color: #FFF5F7;
  }

  .bili-agent-filter-sort__select:focus {
    border-color: #FB7299;
    box-shadow: 0 0 0 3px rgba(251, 114, 153, 0.1);
  }

  /* No Results Message */
  .bili-agent-message-list__no-results {
    padding: 32px 16px;
    text-align: center;
    color: #9499A0;
    font-size: 14px;
  }

  .bili-agent-message-list__no-results p {
    margin: 0;
  }

  /* Model Settings - 模型提供商设置骨架 */
  .bili-agent-model-settings {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
  }

  .bili-agent-model-settings__active-selector {
    width: 100%;
    box-sizing: border-box;
    height: 38px;
    border: 1px solid #E5E9EF;
    border-radius: 8px;
    background-color: #F4F5F7;
    color: #18191C;
    font-family: inherit;
    font-size: 14px;
    padding: 8px 12px;
    outline: none;
    cursor: pointer;
    transition: all 0.25s ease;
  }

  .bili-agent-model-settings__active-selector:hover,
  .bili-agent-model-settings__active-selector:focus {
    border-color: #FB7299;
    background-color: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(251, 114, 153, 0.1);
  }

  .bili-agent-model-settings__provider-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .bili-agent-model-settings__provider-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
    border: 1px solid #E5E9EF;
    border-radius: 12px;
    background-color: #F4F5F7;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    transition: all 0.25s ease;
  }

  .bili-agent-model-settings__provider-card--active {
    border-color: #FB7299;
    background: linear-gradient(135deg, #FFF5F7 0%, #FFFFFF 100%);
    box-shadow: 0 4px 14px rgba(251, 114, 153, 0.16);
  }

  .bili-agent-model-settings__provider-card--custom {
    border-style: dashed;
    background-color: #FFFFFF;
  }

  .bili-agent-model-settings__provider-card:hover {
    border-color: #FB7299;
    background-color: #FFFFFF;
    box-shadow: 0 4px 12px rgba(251, 114, 153, 0.12);
    transform: translateY(-1px);
  }

  .bili-agent-model-settings__provider-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-family: inherit;
    padding: 0;
    text-align: left;
  }

  .bili-agent-model-settings__provider-content:focus {
    outline: 2px solid #FB7299;
    outline-offset: 2px;
    border-radius: 8px;
  }

  .bili-agent-model-settings__provider-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 32px;
  }

  .bili-agent-model-settings__provider-name {
    min-width: 0;
    color: #18191C;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bili-agent-model-settings__provider-format {
    flex-shrink: 0;
    border-radius: 12px;
    background-color: #E3F6FF;
    color: #00A1D6;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    padding: 4px 8px;
  }

  .bili-agent-model-settings__provider-model {
    color: #61666D;
    font-size: 12px;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bili-agent-model-settings__provider-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .bili-agent-model-settings__provider-status {
    color: #9499A0;
    font-size: 12px;
    line-height: 1.4;
  }

  .bili-agent-model-settings__provider-delete {
    align-self: flex-end;
    height: 28px;
    border: 1px solid #FFCCD5;
    border-radius: 14px;
    background-color: #FFF1F0;
    color: #FF6B81;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    padding: 0 12px;
    transition: all 0.25s ease;
  }

  .bili-agent-model-settings__provider-delete:hover {
    background-color: #FFFFFF;
    border-color: #FF6B81;
  }

  .bili-agent-model-settings__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .bili-agent-model-settings__add-custom-btn,
  .bili-agent-model-settings__test-btn {
    height: 34px;
    border-radius: 17px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 0 16px;
    transition: all 0.25s ease;
  }

  .bili-agent-model-settings__add-custom-btn {
    width: 100%;
    border: 1px dashed #FB7299;
    background-color: #FFF5F7;
    color: #FB7299;
  }

  .bili-agent-model-settings__add-custom-btn:hover:not(:disabled) {
    background-color: #FFFFFF;
    box-shadow: 0 2px 8px rgba(251, 114, 153, 0.18);
    transform: translateY(-1px);
  }

  .bili-agent-model-settings__test-btn {
    border: none;
    background: linear-gradient(135deg, #FB7299 0%, #F25D8E 100%);
    color: #FFFFFF;
    box-shadow: 0 2px 8px rgba(251, 114, 153, 0.3);
  }

  .bili-agent-model-settings__test-btn:hover:not(:disabled) {
    box-shadow: 0 4px 12px rgba(251, 114, 153, 0.4);
    transform: translateY(-2px);
  }

  .bili-agent-model-settings__test-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .bili-agent-model-settings__add-custom-btn:disabled,
  .bili-agent-model-settings__test-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
    transform: none;
  }

  .bili-agent-model-settings__test-result--ok,
  .bili-agent-model-settings__test-result--fail {
    min-height: 20px;
    font-size: 12px;
    line-height: 1.6;
  }

  .bili-agent-model-settings__test-result--ok {
    color: #00A65A;
  }

  .bili-agent-model-settings__test-result--fail {
    color: #FF6B81;
  }

  /* Custom Dropdown - 自定义提供商下拉 */
  .bili-agent-model-settings__selector-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .bili-agent-model-settings__selector-row .bili-agent-settings__label {
    flex-shrink: 0;
  }

  .bili-agent-model-settings__custom-dropdown {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .bili-agent-model-settings__custom-dropdown-trigger {
    width: 100%;
    box-sizing: border-box;
    height: 38px;
    border: 1px solid #E5E9EF;
    border-radius: 8px;
    background-color: #F4F5F7;
    color: #18191C;
    font-family: inherit;
    font-size: 14px;
    padding: 0 12px;
    outline: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    transition: all 0.25s ease;
  }

  .bili-agent-model-settings__custom-dropdown-trigger:hover,
  .bili-agent-model-settings__custom-dropdown-trigger:focus,
  .bili-agent-model-settings__custom-dropdown-trigger[aria-expanded="true"] {
    border-color: #FB7299;
    background-color: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(251, 114, 153, 0.1);
  }

  .bili-agent-model-settings__custom-dropdown-trigger-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    flex: 1;
    min-width: 0;
  }

  .bili-agent-model-settings__custom-dropdown-trigger-caret {
    flex-shrink: 0;
    color: #9499A0;
    font-size: 12px;
    line-height: 1;
  }

  .bili-agent-model-settings__custom-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    margin: 0;
    padding: 4px;
    list-style: none;
    background-color: #FFFFFF;
    border: 1px solid #E5E9EF;
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
    z-index: 10002;
    max-height: 280px;
    overflow-y: auto;
  }

  .bili-agent-model-settings__custom-dropdown-item {
    display: flex;
    align-items: stretch;
    border-radius: 6px;
    overflow: hidden;
    transition: background-color 0.2s ease;
  }

  .bili-agent-model-settings__custom-dropdown-item:hover {
    background-color: #FFF5F7;
  }

  .bili-agent-model-settings__custom-dropdown-item--active {
    background-color: #FFF0F4;
  }

  .bili-agent-model-settings__custom-dropdown-item--active .bili-agent-model-settings__custom-dropdown-item-name {
    color: #FB7299;
    font-weight: 600;
  }

  .bili-agent-model-settings__custom-dropdown-item-name {
    flex: 1;
    min-width: 0;
    height: 34px;
    border: 0;
    background: transparent;
    color: #18191C;
    font-family: inherit;
    font-size: 14px;
    padding: 0 10px;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bili-agent-model-settings__custom-dropdown-item-name:focus {
    outline: none;
  }

  .bili-agent-model-settings__custom-dropdown-item-delete {
    flex-shrink: 0;
    width: 28px;
    height: 34px;
    border: 0;
    background: transparent;
    color: #9499A0;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bili-agent-model-settings__custom-dropdown-item-delete:hover {
    color: #FF6B81;
    background-color: #FFF1F0;
  }

  .bili-agent-model-settings__custom-divider {
    height: 1px;
    margin: 4px 6px;
    background-color: #E5E9EF;
    list-style: none;
  }

  .bili-agent-model-settings__add-btn {
    flex-shrink: 0;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: none;
    background: linear-gradient(135deg, #FB7299 0%, #F25D8E 100%);
    color: #FFFFFF;
    font-size: 20px;
    font-weight: 400;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(251, 114, 153, 0.3);
    transition: all 0.25s ease;
    padding: 0;
  }

  .bili-agent-model-settings__add-btn:hover {
    transform: translateY(-1px) scale(1.05);
    box-shadow: 0 4px 12px rgba(251, 114, 153, 0.4);
  }

  .bili-agent-model-settings__add-btn:active {
    transform: translateY(0) scale(1);
  }

  /* ===== 历史记录功能 ===== */

  /* "+" 新建对话按钮 */
  .bili-agent-panel__new-chat-button {
    width: 32px;
    min-width: 32px;
    height: 32px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 16px;
    background-color: rgba(255, 255, 255, 0.15);
    color: #FFFFFF;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    flex-shrink: 0;
    backdrop-filter: blur(10px);
    transition: all 0.25s ease;
    margin-right: 20px;
  }

  .bili-agent-panel__new-chat-button:hover {
    background-color: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.5);
    transform: translateY(-1px);
  }

  /* ▼/▲ 展开图标（视觉指示器） */
  .bili-agent-panel__history-toggle {
    color: #FFFFFF;
    cursor: pointer;
    padding: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .bili-agent-panel__history-toggle:hover {
    opacity: 0.85;
  }

  .bili-agent-panel__history-toggle--open {
    transform: rotate(180deg);
  }

  /* 历史浮层容器 — 圆角毛玻璃卡片 */
  .bili-agent-history-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    left: 12px;
    right: 12px;
    width: auto;
    max-height: 360px;
    overflow-y: auto;
    z-index: 5;
    background-color: rgba(255, 255, 255, 0.80);
    backdrop-filter: blur(20px) saturate(1.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    border-radius: 6px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15),
                0 4px 12px rgba(0, 0, 0, 0.10);
    animation: bili-agent-history-slide-down 0.2s ease-out;
  }

  @keyframes bili-agent-history-slide-down {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* 历史条目 */
  .bili-agent-history-item {
    display: flex;
    align-items: center;
    padding: 10px 16px;
    cursor: pointer;
    border-bottom: 1px solid rgba(0, 0, 0, 0.04);
    transition: background-color 0.15s ease;
  }

  .bili-agent-history-item:hover {
    background-color: rgba(251, 114, 153, 0.06);
  }

  .bili-agent-history-item:focus-visible {
    outline: 2px solid #FB7299;
    outline-offset: -2px;
    background-color: rgba(251, 114, 153, 0.08);
  }

  .bili-agent-history-item__content {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .bili-agent-history-item__title {
    font-size: 14px;
    font-weight: 500;
    color: #212121;
    white-space: nowrap;
    overflow: hidden;
    mask-image: linear-gradient(to right, black calc(100% - 40px), transparent 100%);
    -webkit-mask-image: linear-gradient(to right, black calc(100% - 40px), transparent 100%);
  }

  .bili-agent-history-item__title--scrollable:hover {
    animation: bili-agent-title-scroll 3s ease-in-out 0.5s infinite alternate;
  }

  @keyframes bili-agent-title-scroll {
    0%   { transform: translateX(0); }
    100% { transform: translateX(var(--overflow-width, -50px)); }
  }

  .bili-agent-history-item__meta {
    font-size: 12px;
    color: #999;
    margin-top: 2px;
  }

  .bili-agent-history-item__actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    margin-left: 8px;
    gap: 4px;
  }

  .bili-agent-history-item__rename,
  .bili-agent-history-item__delete {
    opacity: 0;
    width: 24px;
    height: 24px;
    border: none;
    background: none;
    color: #999;
    cursor: pointer;
    flex-shrink: 0;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.15s ease, color 0.15s ease;
  }

  .bili-agent-history-item__rename {
    margin-left: 4px;
  }

  .bili-agent-history-item:hover .bili-agent-history-item__rename,
  .bili-agent-history-item:hover .bili-agent-history-item__delete {
    opacity: 1;
  }

  .bili-agent-history-item__rename:hover,
  .bili-agent-history-item__delete:hover {
    color: #FB7299;
  }

  .bili-agent-history-item__rename-input {
    font-size: 14px;
    font-weight: 500;
    color: #212121;
    border: 1px solid #FB7299;
    border-radius: 4px;
    padding: 2px 6px;
    width: 100%;
    outline: none;
    background: rgba(255, 255, 255, 0.9);
  }

  /* 空状态 */
  .bili-agent-history-empty {
    padding: 32px 16px;
    text-align: center;
    color: #999;
    font-size: 13px;
  }
`;

export const sheet = new CSSStyleSheet();
sheet.replaceSync(css);
export { css as panelCss };


