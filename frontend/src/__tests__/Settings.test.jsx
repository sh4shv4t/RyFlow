/**
 * Tests for the Settings page
 * Covers: render, model selection, language selection, system status display
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}));

const setLanguageMock = vi.fn();
const setSelectedModelMock = vi.fn();

vi.mock('../store/useStore', () => ({
  default: () => ({
    language: 'en',
    setLanguage: setLanguageMock,
    selectedModel: 'phi3:mini',
    setSelectedModel: setSelectedModelMock,
    user: { id: 'u1', name: 'Alice' },
    workspace: { id: 'w1', name: 'CS Project' },
    theme: 'dark',
    toggleTheme: vi.fn(),
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import axios from 'axios';
import Settings from '../pages/Settings';

const mockStatus = {
  ollama_running: true,
  amd_gpu: true,
  gpu_name: 'Radeon RX 7900 XTX',
  vram: '24 GB',
};

const mockModels = [
  { name: 'phi3:mini' },
  { name: 'llama3:8b' },
  { name: 'mistral:7b' },
];

describe('Settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axios.get.mockImplementation((url) => {
      if (url === '/api/ai/system-status') return Promise.resolve({ data: mockStatus });
      if (url === '/api/ai/models') return Promise.resolve({ data: { models: mockModels } });
      return Promise.reject(new Error(`Unexpected GET: ${url}`));
    });
  });

  it('renders the page heading', async () => {
    render(<Settings />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders section headings', async () => {
    render(<Settings />);
    expect(screen.getByText(/System Status/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Model/i)).toBeInTheDocument();
    expect(screen.getByText(/Language/i)).toBeInTheDocument();
    expect(screen.getByText(/About RyFlow/i)).toBeInTheDocument();
  });

  it('displays system status after loading', async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText('Radeon RX 7900 XTX')).toBeInTheDocument();
    });
    expect(screen.getByText('24 GB')).toBeInTheDocument();
  });

  it('displays available models', async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText('llama3:8b')).toBeInTheDocument();
    });
    expect(screen.getByText('mistral:7b')).toBeInTheDocument();
  });

  it('calls setSelectedModel when a different model is clicked', async () => {
    render(<Settings />);
    await waitFor(() => screen.getByText('llama3:8b'));
    fireEvent.click(screen.getByText('llama3:8b'));
    expect(setSelectedModelMock).toHaveBeenCalledWith('llama3:8b');
  });

  it('calls setLanguage when a language button is clicked', async () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Hindi'));
    expect(setLanguageMock).toHaveBeenCalledWith('hi');
  });

  it('calls setLanguage with correct code for Spanish', async () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Spanish'));
    expect(setLanguageMock).toHaveBeenCalledWith('es');
  });

  it('shows error fallback message when no models found', async () => {
    axios.get.mockImplementation((url) => {
      if (url === '/api/ai/system-status') return Promise.resolve({ data: mockStatus });
      if (url === '/api/ai/models') return Promise.resolve({ data: { models: [] } });
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText(/No models found/i)).toBeInTheDocument();
    });
  });
});
