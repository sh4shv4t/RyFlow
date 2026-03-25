// Global command palette with semantic workspace search and quick actions.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Command, FileText, CheckSquare, Code2, PencilRuler, Cpu, Search } from 'lucide-react';
import useStore from '../../store/useStore';

function iconForType(type) {
  if (type === 'doc') return FileText;
  if (type === 'task') return CheckSquare;
  if (type === 'code') return Code2;
  if (type === 'canvas') return PencilRuler;
  if (type === 'ai_chat') return Cpu;
  return Search;
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const { workspace, commandPaletteOpen, setCommandPaletteOpen } = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (event) => {
      const isHotkey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (!isHotkey) return;
      event.preventDefault();
      setCommandPaletteOpen(!commandPaletteOpen);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (!commandPaletteOpen || !workspace?.id) return;
    const timer = setTimeout(async () => {
      const q = query.trim();
      if (!q) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await axios.get('/api/workspace/search', {
          params: { workspace_id: workspace.id, q }
        });
        setResults(res.data.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query, commandPaletteOpen, workspace?.id]);

  const quickActions = useMemo(() => ([
    { key: 'new-doc', label: 'New Document', run: () => navigate('/editor') },
    { key: 'new-task', label: 'Open Tasks', run: () => navigate('/tasks') },
    { key: 'open-graph', label: 'Open Graph', run: () => navigate('/graph') },
    { key: 'open-tags', label: 'Open Tags', run: () => navigate('/tags') }
  ]), [navigate]);

  const openResult = (item) => {
    if (!item) return;
    if (item.type === 'doc') navigate(item.source_id ? `/editor/${item.source_id}` : '/editor');
    else if (item.type === 'task') navigate('/tasks');
    else if (item.type === 'code') navigate(item.source_id ? `/code/${item.source_id}` : '/code');
    else if (item.type === 'canvas') navigate(item.source_id ? `/canvas/${item.source_id}` : '/canvas');
    else if (item.type === 'ai_chat') navigate('/ai');
    else navigate('/');
    setCommandPaletteOpen(false);
  };

  if (!commandPaletteOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[14vh] px-4" onClick={() => setCommandPaletteOpen(false)}>
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-amd-charcoal shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
          <Command size={16} className="text-amd-red" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workspace or run a command..."
            className="flex-1 bg-transparent outline-none text-amd-white placeholder:text-amd-white/35"
          />
          <span className="text-[10px] px-2 py-1 rounded bg-white/5 text-amd-white/40">Ctrl/Cmd+K</span>
        </div>

        {query.trim() === '' ? (
          <div className="p-3 space-y-2">
            {quickActions.map((action) => (
              <button
                key={action.key}
                onClick={() => {
                  action.run();
                  setCommandPaletteOpen(false);
                }}
                className="w-full text-left p-2 rounded-lg hover:bg-white/5 text-sm text-amd-white/80"
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="max-h-[52vh] overflow-auto p-2">
            {loading ? <div className="p-3 text-xs text-amd-white/50">Searching...</div> : null}
            {!loading && results.length === 0 ? <div className="p-3 text-xs text-amd-white/50">No matches found</div> : null}
            {results.map((item) => {
              const Icon = iconForType(item.type);
              return (
                <button
                  key={item.id}
                  onClick={() => openResult(item)}
                  className="w-full text-left p-2 rounded-lg hover:bg-white/5 flex items-start gap-2"
                >
                  <Icon size={14} className="text-amd-red mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-sm text-amd-white truncate">{item.title}</div>
                    <div className="text-[11px] text-amd-white/45 capitalize">{item.type.replace('_', ' ')} · {(Number(item.score || 0) * 100).toFixed(0)}%</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
