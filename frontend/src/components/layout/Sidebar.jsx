// Sidebar navigation — minimalist dark sidebar with icon links
import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Home, FileText, CheckSquare, GitBranch, Cpu,
  Settings, PanelLeftClose, PanelLeft, Zap
} from 'lucide-react';
import useStore from '../../store/useStore';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/editor', icon: FileText, label: 'Editor' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/graph', icon: GitBranch, label: 'Graph' },
  { to: '/ai', icon: Cpu, label: 'AI Studio' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, workspace } = useStore();

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 220 }}
      className="h-screen bg-amd-gray/50 border-r border-white/5 flex flex-col py-4 relative"
    >
      {/* Logo */}
      <div className="px-4 mb-8 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-amd-red flex items-center justify-center flex-shrink-0">
          <Zap size={18} className="text-white" />
        </div>
        {!sidebarCollapsed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-hidden">
            <h1 className="font-heading font-bold text-lg text-amd-white leading-none">RyFlow</h1>
            <p className="text-[10px] text-amd-white/40 leading-none mt-0.5">Your Campus. Your GPU.</p>
          </motion.div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group
              ${isActive
                ? 'bg-amd-red/10 text-amd-red glow-red-subtle'
                : 'text-amd-white/60 hover:text-amd-white hover:bg-white/5'
              }`
            }
          >
            <item.icon size={20} className="flex-shrink-0" />
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm font-medium"
              >
                {item.label}
              </motion.span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Workspace info */}
      {!sidebarCollapsed && workspace && (
        <div className="px-4 py-3 mx-2 mb-2 glass-card">
          <p className="text-xs text-amd-white/40">Workspace</p>
          <p className="text-sm font-medium text-amd-white truncate">{workspace.name}</p>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-amd-gray border border-white/10 flex items-center justify-center hover:border-amd-red/50 transition-colors"
      >
        {sidebarCollapsed ? <PanelLeft size={12} /> : <PanelLeftClose size={12} />}
      </button>
    </motion.aside>
  );
}
