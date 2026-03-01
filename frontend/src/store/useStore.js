// Zustand global state store — manages user, workspace, AI status, and app state
import { create } from 'zustand';

const useStore = create((set, get) => ({
  // User state
  user: JSON.parse(localStorage.getItem('ryflow_user') || 'null'),
  setUser: (user) => {
    localStorage.setItem('ryflow_user', JSON.stringify(user));
    set({ user });
  },

  // Workspace state
  workspace: JSON.parse(localStorage.getItem('ryflow_workspace') || 'null'),
  setWorkspace: (workspace) => {
    localStorage.setItem('ryflow_workspace', JSON.stringify(workspace));
    set({ workspace });
  },

  // AI system status
  aiStatus: {
    gpuDetected: false,
    gpuName: null,
    rocmAvailable: false,
    modelLoaded: null,
    inferenceMode: 'CPU',
    ollamaRunning: false,
    models: []
  },
  setAiStatus: (status) => set({ aiStatus: status }),

  // AI inference activity (for badge pulse)
  aiActive: false,
  setAiActive: (active) => set({ aiActive: active }),

  // Connected peers list
  peers: [],
  setPeers: (peers) => set({ peers }),

  // Current document being edited
  currentDoc: null,
  setCurrentDoc: (doc) => set({ currentDoc: doc }),

  // Sidebar collapsed state
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  // Selected language for AI responses
  language: localStorage.getItem('ryflow_language') || 'en',
  setLanguage: (lang) => {
    localStorage.setItem('ryflow_language', lang);
    set({ language: lang });
  },

  // Selected model for AI
  selectedModel: localStorage.getItem('ryflow_model') || 'phi3:mini',
  setSelectedModel: (model) => {
    localStorage.setItem('ryflow_model', model);
    set({ selectedModel: model });
  },

  // Theme: 'dark' | 'light'
  theme: localStorage.getItem('ryflow_theme') || 'dark',
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('ryflow_theme', next);
      return { theme: next };
    }),
  setTheme: (theme) => {
    localStorage.setItem('ryflow_theme', theme);
    set({ theme });
  },

  // Logout / reset
  logout: () => {
    localStorage.removeItem('ryflow_user');
    localStorage.removeItem('ryflow_workspace');
    set({ user: null, workspace: null });
  }
}));

export default useStore;
