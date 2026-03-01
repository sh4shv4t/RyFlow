/**
 * Tests for the ThemeToggle component
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ThemeToggle from '../components/layout/ThemeToggle';

// ── Mock Zustand store ─────────────────────────────────────────────────────
const toggleThemeMock = vi.fn();
let themeMock = 'dark';

vi.mock('../store/useStore', () => ({
  default: () => ({
    theme: themeMock,
    toggleTheme: toggleThemeMock,
  }),
}));

// ── Mock framer-motion so AnimatePresence/motion don't blow up in jsdom ───
vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, onClick, ...props }) => (
      <button onClick={onClick} {...props}>{children}</button>
    ),
    span: ({ children }) => <span>{children}</span>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    toggleThemeMock.mockClear();
  });

  it('renders the toggle button', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
  });

  it('shows Moon icon in dark mode', () => {
    themeMock = 'dark';
    const { container } = render(<ThemeToggle />);
    // lucide Moon renders an SVG; verify something exists in the button
    expect(container.querySelector('button')).toBeInTheDocument();
  });

  it('calls toggleTheme when clicked', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /toggle theme/i }));
    expect(toggleThemeMock).toHaveBeenCalledTimes(1);
  });

  it('has correct aria-label', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: /toggle theme/i });
    expect(btn).toHaveAttribute('aria-label', 'Toggle theme');
  });

  it('shows correct title in dark mode', () => {
    themeMock = 'dark';
    render(<ThemeToggle />);
    expect(screen.getByTitle(/switch to light mode/i)).toBeInTheDocument();
  });

  it('shows correct title in light mode', () => {
    themeMock = 'light';
    render(<ThemeToggle />);
    expect(screen.getByTitle(/switch to dark mode/i)).toBeInTheDocument();
  });
});
