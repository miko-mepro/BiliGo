import { useState, type FormEvent } from 'react'
import type { ProviderConfig } from '../lib/shared-types/provider.js'
import { BUILT_IN_PROVIDERS } from '../lib/shared-types/provider.js'
import {
  saveBiliAgentSettings,
  type BiliAgentSettings,
} from '../config/settings.js'

interface SettingsPanelProps {
  settings: BiliAgentSettings
  onClose: () => void
  onSaved: (settings: BiliAgentSettings) => void
}

export function SettingsPanel({ settings, onClose, onSaved }: SettingsPanelProps) {
  const [providers, setProviders] = useState<ProviderConfig[]>(() => {
    const builtinList = Object.values(BUILT_IN_PROVIDERS).map((info) => {
      const existing = settings.providers.find((p) => p.id === info.id)
      return {
        ...info,
        apiKey: existing?.apiKey ?? '',
        model: existing?.model ?? '',
      }
    })
    return builtinList
  })
  const [activeProviderId, setActiveProviderId] = useState<string | null>(
    settings.activeProviderId,
  )
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')

  const updateField = (id: string, field: 'apiKey' | 'model', value: string): void => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    )
    setSavedMessage('')
  }

  const handleSelectActive = (id: string): void => {
    setActiveProviderId((prev) => (prev === id ? null : id))
    setSavedMessage('')
  }

  const handleSave = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setSaving(true)
    try {
      const next: BiliAgentSettings = {
        providers,
        activeProviderId,
        themeMode: settings.themeMode,
      }
      const saved = await saveBiliAgentSettings(next)
      onSaved(saved)
      setSavedMessage('已保存')
    } catch (err) {
      setSavedMessage(`保存失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      maxHeight: '100%',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      border: 'none',
      background: '#fff',
      borderRadius: 0,
      boxShadow: 'none',
      zIndex: 'auto',
      pointerEvents: 'auto',
    }}>
      <div style={{
        padding: 10,
        borderBottom: '1px solid #eee',
        fontWeight: 600,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>Provider 配置</span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: 18,
            cursor: 'pointer',
            color: '#666',
            padding: '0 6px',
          }}
          title="返回聊天"
        >
          ×
        </button>
      </div>

      <form onSubmit={handleSave} style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {providers.map((p) => {
          const isActive = activeProviderId === p.id
          return (
            <div
              key={p.id}
              style={{
                border: `1px solid ${isActive ? '#FB7299' : '#eee'}`,
                borderRadius: 6,
                padding: 8,
                background: isActive ? '#fff5f8' : '#fafafa',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="radio"
                      name="active-provider"
                      checked={isActive}
                      onChange={() => handleSelectActive(p.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    {p.name}
                  </label>
                </div>
                <div style={{ fontSize: 11, color: '#999' }}>{p.format}</div>
              </div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 4, wordBreak: 'break-all' }}>
                {p.baseUrl}
              </div>
              <input
                type="password"
                value={p.apiKey}
                onChange={(e) => updateField(p.id, 'apiKey', e.target.value)}
                placeholder="API Key"
                autoComplete="off"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '4px 6px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  fontSize: 12,
                  marginBottom: 4,
                }}
              />
              <input
                type="text"
                value={p.model}
                onChange={(e) => updateField(p.id, 'model', e.target.value)}
                placeholder="模型名 (如 gpt-4o / claude-3-5-sonnet)"
                autoComplete="off"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '4px 6px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              />
            </div>
          )
        })}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '6px 14px',
              background: saving ? '#ccc' : '#FB7299',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              background: '#f0f0f0',
              color: '#333',
              border: '1px solid #ddd',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            返回聊天
          </button>
          {savedMessage && (
            <span style={{
              fontSize: 12,
              color: savedMessage.startsWith('保存失败') ? '#e53935' : '#4caf50',
              marginLeft: 'auto',
            }}>
              {savedMessage}
            </span>
          )}
        </div>
        {!activeProviderId && (
          <div style={{ fontSize: 11, color: '#e6a700' }}>
            尚未选择活动 Provider，保存后仍无法发送消息
          </div>
        )}
      </form>
    </div>
  )
}
