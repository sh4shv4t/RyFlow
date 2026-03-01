// ThemeToggle — Sun/Moon button that switches dark ↔ light mode
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import useStore from '../../store/useStore';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useStore();
  const isDark = theme === 'dark';

  return (
    <motion.button
      onClick={toggleTheme}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      aria-label="Toggle theme"
      whileTap={{ scale: 0.9 }}
      className={`relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
        isDark
          ? 'text-amd-white/50 hover:text-amd-white hover:bg-white/5'
          : 'text-gray-500 hover:text-gray-800 hover:bg-black/5'
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="moon"
            initial={{ opacity: 0, rotate: -30, scale: 0.8 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 30, scale: 0.8 }}
            transition={{ duration: 0.2 }}
          >
            <Moon size={16} />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ opacity: 0, rotate: 30, scale: 0.8 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -30, scale: 0.8 }}
            transition={{ duration: 0.2 }}
          >
            <Sun size={16} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
