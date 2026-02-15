/**
 * OpenPath - WebExtensions API Mock
 * Minimal mock for testing extension code without a browser
 */

// =============================================================================
// Mock Storage
// =============================================================================

export interface MockBadgeState {
  text: string;
  color: string;
}

export interface MockBrowserState {
  badges: Map<number, MockBadgeState>;
  lastError: Error | null;
  messages: unknown[];
  nativePort: MockPort | null;
}

export const mockState: MockBrowserState = {
  badges: new Map(),
  lastError: null,
  messages: [],
  nativePort: null,
};

// =============================================================================
// Mock Port (for Native Messaging)
// =============================================================================

export interface MockPort {
  name: string;
  onDisconnect: {
    addListener: (callback: (port: MockPort) => void) => void;
    removeListener: (callback: (port: MockPort) => void) => void;
  };
  onMessage: {
    addListener: (callback: (message: unknown) => void) => void;
    removeListener: (callback: (message: unknown) => void) => void;
  };
  postMessage: (message: unknown) => void;
  disconnect: () => void;
}

function createMockPort(name: string): MockPort {
  const disconnectListeners: ((port: MockPort) => void)[] = [];
  const messageListeners: ((message: unknown) => void)[] = [];

  const port: MockPort = {
    name,
    onDisconnect: {
      addListener: (cb) => {
        disconnectListeners.push(cb);
      },
      removeListener: (cb) => {
        const idx = disconnectListeners.indexOf(cb);
        if (idx >= 0) disconnectListeners.splice(idx, 1);
      },
    },
    onMessage: {
      addListener: (cb) => {
        messageListeners.push(cb);
      },
      removeListener: (cb) => {
        const idx = messageListeners.indexOf(cb);
        if (idx >= 0) messageListeners.splice(idx, 1);
      },
    },
    postMessage: (message) => {
      mockState.messages.push(message);
    },
    disconnect: () => {
      disconnectListeners.forEach((cb) => {
        cb(port);
      });
    },
  };

  return port;
}

// =============================================================================
// Mock Browser API
// =============================================================================

export const mockBrowser = {
  browserAction: {
    setBadgeText: (options: { text: string; tabId: number }): Promise<void> => {
      const current = mockState.badges.get(options.tabId) ?? { text: '', color: '' };
      mockState.badges.set(options.tabId, { ...current, text: options.text });
      return Promise.resolve();
    },
    setBadgeBackgroundColor: (options: { color: string; tabId: number }): Promise<void> => {
      const current = mockState.badges.get(options.tabId) ?? { text: '', color: '' };
      mockState.badges.set(options.tabId, { ...current, color: options.color });
      return Promise.resolve();
    },
  },

  runtime: {
    lastError: null as Error | null,

    sendMessage: (message: unknown): Promise<unknown> => {
      mockState.messages.push(message);
      return Promise.resolve({ success: true });
    },

    sendNativeMessage: (_hostName: string, message: unknown): Promise<unknown> => {
      mockState.messages.push(message);
      return Promise.resolve({ success: true });
    },

    connectNative: (hostName: string): MockPort => {
      mockState.nativePort = createMockPort(hostName);
      return mockState.nativePort;
    },

    onMessage: {
      addListener: (
        _callback: (message: unknown, sender: unknown) => boolean | Promise<unknown>
      ): void => {
        // No-op for tests
      },
      removeListener: (_callback: unknown): void => {
        // No-op
      },
    },
  },

  tabs: {
    query: (_queryInfo: {
      active?: boolean;
      currentWindow?: boolean;
    }): Promise<{ id: number; url?: string }[]> => {
      return Promise.resolve([{ id: 1, url: 'https://example.com/page' }]);
    },

    onRemoved: {
      addListener: (_callback: (tabId: number) => void): void => {
        // No-op
      },
      removeListener: (_callback: unknown): void => {
        // No-op
      },
    },
  },

  webRequest: {
    onBeforeRequest: {
      addListener: (_callback: unknown, _filter: unknown, _extraInfoSpec?: unknown): void => {
        // No-op
      },
      removeListener: (_callback: unknown): void => {
        // No-op
      },
    },
    onErrorOccurred: {
      addListener: (_callback: unknown, _filter: unknown): void => {
        // No-op
      },
      removeListener: (_callback: unknown): void => {
        // No-op
      },
    },
  },

  webNavigation: {
    onBeforeNavigate: {
      addListener: (_callback: unknown): void => {
        // No-op
      },
      removeListener: (_callback: unknown): void => {
        // No-op
      },
    },
  },
};

// =============================================================================
// Reset Function
// =============================================================================

export function resetMockState(): void {
  mockState.badges.clear();
  mockState.lastError = null;
  mockState.messages = [];
  mockState.nativePort = null;
}

// =============================================================================
// Helper to get badge for a tab
// =============================================================================

export function getBadgeForTab(tabId: number): MockBadgeState | undefined {
  return mockState.badges.get(tabId);
}
