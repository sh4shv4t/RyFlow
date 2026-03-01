/**
 * Tests for the Zustand global store
 * Covers: theme toggle, user/workspace setters, language & model selection
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock localStorage before the store module is loaded ───────────────────
const localStorageMock = (() => {
  let _store = {};
  return {
    getItem: (key) => _store[key] ?? null,
    setItem: (key, value) => { _store[key] = String(value); },
    removeItem: (key) => { delete _store[key]; },
    clear: () => { _store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ── Import store AFTER localStorage mock is in place ──────────────────────
const { default: useStore } = await import('../store/useStore');

// Helper: read store state
const getState = () => useStore.getState();

describe('useStore — theme', () => {
  beforeEach(() => {
    // Reset theme to dark before each test
    getState().setTheme('dark');
  });

  it('defaults to dark theme', () => {
    expect(getState().theme).toBe('dark');
  });

  it('toggleTheme switches dark → light', () => {
    getState().toggleTheme();
    expect(getState().theme).toBe('light');
  });

  it('toggleTheme switches light → dark', () => {
    getState().setTheme('light');
    getState().toggleTheme();
    expect(getState().theme).toBe('dark');
  });

  it('setTheme directly sets the value', () => {
    getState().setTheme('light');
    expect(getState().theme).toBe('light');
    getState().setTheme('dark');
    expect(getState().theme).toBe('dark');
  });

  it('persists theme to localStorage on toggle', () => {
    getState().toggleTheme();
    expect(localStorage.getItem('ryflow_theme')).toBe('light');
  });

  it('persists theme to localStorage on setTheme', () => {
    getState().setTheme('light');
    expect(localStorage.getItem('ryflow_theme')).toBe('light');
  });
});

describe('useStore — user', () => {
  it('setUser updates user state', () => {
    const user = { id: 'u1', name: 'Alice', avatar_color: '#E8000D' };
    getState().setUser(user);
    expect(getState().user).toEqual(user);
  });

  it('setUser persists to localStorage', () => {
    const user = { id: 'u2', name: 'Bob' };
    getState().setUser(user);
    expect(JSON.parse(localStorage.getItem('ryflow_user'))).toEqual(user);
  });
});

describe('useStore — workspace', () => {
  it('setWorkspace updates workspace state', () => {
    const ws = { id: 'w1', name: 'CS Project' };
    getState().setWorkspace(ws);
    expect(getState().workspace).toEqual(ws);
  });
});

describe('useStore — sidebar', () => {
  it('toggleSidebar flips sidebarCollapsed', () => {
    const initial = getState().sidebarCollapsed;
    getState().toggleSidebar();
    expect(getState().sidebarCollapsed).toBe(!initial);
    getState().toggleSidebar();
    expect(getState().sidebarCollapsed).toBe(initial);
  });
});

describe('useStore — language', () => {
  it('setLanguage updates language', () => {
    getState().setLanguage('hi');
    expect(getState().language).toBe('hi');
  });

  it('setLanguage persists to localStorage', () => {
    getState().setLanguage('fr');
    expect(localStorage.getItem('ryflow_language')).toBe('fr');
  });
});

describe('useStore — model', () => {
  it('setSelectedModel updates selectedModel', () => {
    getState().setSelectedModel('llama3:8b');
    expect(getState().selectedModel).toBe('llama3:8b');
  });
});

describe('useStore — AI status', () => {
  it('setAiStatus merges the status object', () => {
    const status = {
      gpuDetected: true,
      gpuName: 'Radeon RX 7900',
      ollamaRunning: true,
      inferenceMode: 'GPU',
      models: ['phi3:mini'],
    };
    getState().setAiStatus(status);
    expect(getState().aiStatus).toEqual(status);
  });
});

describe('useStore — peers', () => {
  it('setPeers replaces peer list', () => {
    const peers = [{ id: 'p1', name: 'Dan' }, { id: 'p2', name: 'Eve' }];
    getState().setPeers(peers);
    expect(getState().peers).toHaveLength(2);
    expect(getState().peers[0].name).toBe('Dan');
  });
});
