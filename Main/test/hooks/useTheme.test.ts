import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useTheme } from '../../src/hooks/useTheme.js'
import { SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS, type BiliAgentSettings } from '../../src/config/settings.js'

const DARK_QUERY = '(prefers-color-scheme: dark)';

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void;

type MediaListener = (event: MediaQueryListEvent) => void;

interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  onchange: ((event: MediaQueryListEvent) => void) | null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
}

let storageListeners: StorageListener[];
let mediaListeners: MediaListener[];
let fakeMediaQuery: FakeMediaQueryList;

function setSystemDark(dark: boolean): void {
  fakeMediaQuery.matches = dark;
}

function fireMediaChange(dark: boolean): void {
  fakeMediaQuery.matches = dark;
  const ev = { matches: dark, media: DARK_QUERY } as MediaQueryListEvent;
  for (const l of mediaListeners) l(ev);
}

function fireStorageChange(newSettings: BiliAgentSettings | undefined, oldSettings?: BiliAgentSettings): void {
  const change: chrome.storage.StorageChange = {
    newValue: newSettings,
    oldValue: oldSettings,
  };
  for (const l of storageListeners) {
    l({ [SETTINGS_STORAGE_KEY]: change }, 'local');
  }
}

function settingsWith(themeMode: BiliAgentSettings['themeMode']): BiliAgentSettings {
  return { ...DEFAULT_SETTINGS, themeMode };
}

beforeEach(() => {
  vi.clearAllMocks();
  storageListeners = [];
  mediaListeners = [];

  fakeMediaQuery = {
    matches: false,
    media: DARK_QUERY,
    onchange: null,
    addEventListener: vi.fn((event: string, l: MediaListener) => {
      if (event === 'change') mediaListeners.push(l);
    }),
    removeEventListener: vi.fn((event: string, l: MediaListener) => {
      if (event === 'change') {
        const i = mediaListeners.indexOf(l);
        if (i >= 0) mediaListeners.splice(i, 1);
      }
    }),
    addListener: vi.fn((l: MediaListener) => mediaListeners.push(l)),
    removeListener: vi.fn((l: MediaListener) => {
      const i = mediaListeners.indexOf(l);
      if (i >= 0) mediaListeners.splice(i, 1);
    }),
    dispatchEvent: vi.fn(),
  };

  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => {
      fakeMediaQuery.media = q;
      return fakeMediaQuery as unknown as MediaQueryList;
    }),
  );
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: window.matchMedia ?? globalThis.matchMedia,
  });
  window.matchMedia = globalThis.matchMedia as typeof window.matchMedia;

  (chrome.storage.local.get as any).mockImplementation((_keys: unknown) =>
    Promise.resolve({ [SETTINGS_STORAGE_KEY]: DEFAULT_SETTINGS }),
  );
  (chrome.storage.onChanged.addListener as any).mockImplementation((cb: StorageListener) => {
    storageListeners.push(cb);
  });
  (chrome.storage.onChanged.removeListener as any).mockImplementation((cb: StorageListener) => {
    const i = storageListeners.indexOf(cb);
    if (i >= 0) storageListeners.splice(i, 1);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTheme', () => {
  it('D-1 default auto + system light resolves light', async () => {
    setSystemDark(false);
    (chrome.storage.local.get as any).mockResolvedValueOnce({
      [SETTINGS_STORAGE_KEY]: settingsWith('auto'),
    });

    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current).toBe('light'));
  });

  it('D-2 default auto + system dark resolves dark', async () => {
    setSystemDark(true);
    (chrome.storage.local.get as any).mockResolvedValueOnce({
      [SETTINGS_STORAGE_KEY]: settingsWith('auto'),
    });

    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current).toBe('dark'));
  });

  it('D-3 stored themeMode light forces light even when system dark', async () => {
    setSystemDark(true);
    (chrome.storage.local.get as any).mockResolvedValueOnce({
      [SETTINGS_STORAGE_KEY]: settingsWith('light'),
    });

    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current).toBe('light'));
  });

  it('D-4 stored themeMode dark forces dark even when system light', async () => {
    setSystemDark(false);
    (chrome.storage.local.get as any).mockResolvedValueOnce({
      [SETTINGS_STORAGE_KEY]: settingsWith('dark'),
    });

    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current).toBe('dark'));
  });

  it('D-5 storage onChanged from light to dark updates returned theme', async () => {
    setSystemDark(false);
    (chrome.storage.local.get as any).mockResolvedValueOnce({
      [SETTINGS_STORAGE_KEY]: settingsWith('light'),
    });

    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current).toBe('light'));

    act(() => {
      fireStorageChange(settingsWith('dark'), settingsWith('light'));
    });
    await waitFor(() => expect(result.current).toBe('dark'));
  });

  it('D-6 storage onChanged to auto follows current system preference', async () => {
    setSystemDark(true);
    (chrome.storage.local.get as any).mockResolvedValueOnce({
      [SETTINGS_STORAGE_KEY]: settingsWith('light'),
    });

    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current).toBe('light'));

    act(() => {
      fireStorageChange(settingsWith('auto'), settingsWith('light'));
    });
    await waitFor(() => expect(result.current).toBe('dark'));
  });

  it('D-7 matchMedia change updates returned theme while mode is auto', async () => {
    setSystemDark(false);
    (chrome.storage.local.get as any).mockResolvedValueOnce({
      [SETTINGS_STORAGE_KEY]: settingsWith('auto'),
    });

    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current).toBe('light'));

    act(() => {
      fireMediaChange(true);
    });
    await waitFor(() => expect(result.current).toBe('dark'));
  });

  it('D-8 matchMedia change does not override explicit light/dark mode, and listeners are cleaned up on unmount', async () => {
    setSystemDark(false);
    (chrome.storage.local.get as any).mockResolvedValueOnce({
      [SETTINGS_STORAGE_KEY]: settingsWith('light'),
    });

    const { result, unmount } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current).toBe('light'));

    // System flipping to dark in 'light' mode must NOT change the result.
    act(() => {
      fireMediaChange(true);
    });
    expect(result.current).toBe('light');

    const storageListenersBefore = storageListeners.length;
    const mediaListenersBefore = mediaListeners.length;
    expect(storageListenersBefore).toBeGreaterThan(0);
    expect(mediaListenersBefore).toBeGreaterThan(0);

    unmount();

    expect(storageListeners.length).toBe(storageListenersBefore - 1);
    expect(mediaListeners.length).toBe(mediaListenersBefore - 1);
  });
});
