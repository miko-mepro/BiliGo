import { useEffect, useState } from 'react';
import {
  SETTINGS_STORAGE_KEY,
  normalizeSettings,
  readBiliAgentSettings,
  type BiliAgentSettings,
  type ThemeMode,
} from '../config/settings.js'

export type ResolvedTheme = 'light' | 'dark';

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  try {
    return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function resolveTheme(mode: ThemeMode, system: ResolvedTheme): ResolvedTheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return system;
}

/**
 * Orchestrates panel theme resolution. Reads settings.themeMode, reacts to
 * chrome.storage.onChanged for cross-context updates, and observes
 * matchMedia('(prefers-color-scheme: dark)') changes when mode === 'auto'.
 */
export function useTheme(): ResolvedTheme {
  const [mode, setMode] = useState<ThemeMode>('auto');
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  // Initial settings read.
  useEffect(() => {
    let cancelled = false;
    readBiliAgentSettings()
      .then(settings => {
        if (!cancelled) setMode(settings.themeMode);
      })
      .catch(() => {
        if (!cancelled) setMode('auto');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // chrome.storage.onChanged listener for cross-context settings updates.
  useEffect(() => {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ): void => {
      if (areaName !== 'local') return;
      const change = changes[SETTINGS_STORAGE_KEY];
      if (!change) return;
      const next: BiliAgentSettings = normalizeSettings(change.newValue);
      setMode(next.themeMode);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  // matchMedia listener for system theme changes.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(DARK_MEDIA_QUERY);
    // Sync once in case it has changed since initial render.
    setSystemTheme(mql.matches ? 'dark' : 'light');
    const onChange = (event: MediaQueryListEvent): void => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Legacy fallback (Safari < 14).
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return resolveTheme(mode, systemTheme);
}
