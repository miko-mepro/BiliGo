import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ToggleButton, type ToggleButtonRect } from './ToggleButton.js'
import { Panel } from './Panel.js'
import { useTheme } from '../hooks/useTheme.js'

const STORAGE_KEY = 'bili-agent-panel-open'

export function App(): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [toggleButtonRect, setToggleButtonRect] = useState<ToggleButtonRect | null>(null)
  const isInteractingRef = useRef(false)
  const theme = useTheme()

  useEffect(() => {
    const root = document.getElementById('bili-agent-host')?.shadowRoot?.querySelector(
      '[data-bili-agent-root]',
    ) as HTMLElement | null
    if (root) {
      root.setAttribute('data-theme', theme)
      root.classList.toggle('bili-agent-theme-dark', theme === 'dark')
      root.classList.toggle('bili-agent-theme-light', theme === 'light')
    }
  }, [theme])

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY]).then((result) => {
      if (result[STORAGE_KEY] === true) {
        setIsOpen(true)
      }
      setIsReady(true)
    })

    const handleChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[STORAGE_KEY]) {
        setIsOpen(!!changes[STORAGE_KEY].newValue)
      }
    }

    chrome.storage.onChanged.addListener(handleChange)
    return () => {
      chrome.storage.onChanged.removeListener(handleChange)
    }
  }, [])

  useEffect(() => {
    if (isReady) {
      void chrome.storage.local.set({ [STORAGE_KEY]: isOpen })
    }
  }, [isOpen, isReady])

  const handleToggle = useCallback((buttonRect: ToggleButtonRect | null) => {
    setToggleButtonRect(buttonRect)
    setIsOpen((prev) => !prev)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handlePanelInteractionStateChange = useCallback((isInteracting: boolean) => {
    isInteractingRef.current = isInteracting
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleOutsideClick = (event: PointerEvent) => {
      const path = event.composedPath()
      const isInsidePanel = path.some((target) => {
        return target instanceof HTMLElement && target.hasAttribute('data-bili-agent-panel')
      })
      const isToggle = path.some((target) => {
        return target instanceof HTMLElement && target.classList?.contains('bili-agent-toggle')
      })

      if (!isInsidePanel && !isToggle && !isInteractingRef.current) {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handleOutsideClick)
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick)
    }
  }, [isOpen])

  if (!isReady) {
    return <></>
  }

  return (
    <div data-bili-agent-root data-theme={theme} className={`bili-agent-theme-${theme}`}>
      {!isOpen && <ToggleButton onClick={handleToggle} isOpen={isOpen} />}
      <Panel
        isOpen={isOpen}
        toggleButtonRect={toggleButtonRect}
        onClose={handleClose}
        onInteractionStateChange={handlePanelInteractionStateChange}
      />
    </div>
  )
}
