// Slide-in backlinks panel showing incoming and outgoing graph references.
import React from 'react';
import { X } from 'lucide-react';

const TYPE_ICON = {
  doc: '📄',
  task: '✅',
  code: '💻',
  canvas: '🎨',
  ai_chat: '🤖',
  voice: '🎙'
};

const TYPE_COLOR = {
  doc: 'text-amd-red',
  task: 'text-amd-orange',
  code: 'text-cyan-300',
  canvas: 'text-emerald-300',
  ai_chat: 'text-violet-300',
  voice: 'text-green-300'
};

// Renders a single backlinks item card.
function BacklinkItem({ entry, incoming, onOpen }) {
  return (
    <button
      onClick={() => onOpen?.(entry, incoming)}
      className="w-full text-left rounded-lg bg-white/5 hover:bg-white/10 p-2 border border-white/10"
    >
      <div className="flex items-center gap-2">
        <span className={TYPE_COLOR[entry.type] || 'text-amd-white/60'}>{TYPE_ICON[entry.type] || '🔗'}</span>
        <span className="text-sm text-amd-white truncate">{entry.title || 'Untitled'}</span>
      </div>
      <div className="text-[11px] text-amd-orange mt-1">{entry.relationship_label || 'related'}</div>
      <div className="text-[11px] text-amd-white/45 mt-1">{String(entry.content_summary || '').slice(0, 80)}</div>
    </button>
  );
}

export default function BacklinksPanel({ open, loading, backlinks, onClose, onOpenNode }) {
  if (!open) return null;

  const incoming = backlinks?.incoming || [];
  const outgoing = backlinks?.outgoing || [];
  const empty = !loading && incoming.length === 0 && outgoing.length === 0;

  return (
    <div className="w-[360px] border-l border-white/10 bg-amd-charcoal/95 p-3 overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-amd-white">Backlinks</h3>
        <button onClick={onClose} className="text-amd-white/50 hover:text-amd-white"><X size={14} /></button>
      </div>

      {loading ? <div className="text-sm text-amd-white/50">Loading backlinks...</div> : null}

      {empty ? (
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-sm text-amd-white/55">
          No connections yet. Save this document to start building your knowledge graph.
        </div>
      ) : null}

      <div className="space-y-4">
        <section>
          <h4 className="text-xs uppercase tracking-wide text-amd-white/45 mb-2">Referenced By ({incoming.length})</h4>
          <div className="space-y-2">
            {incoming.map((entry) => <BacklinkItem key={entry.id} entry={entry} incoming onOpen={onOpenNode} />)}
          </div>
        </section>

        <section>
          <h4 className="text-xs uppercase tracking-wide text-amd-white/45 mb-2">References ({outgoing.length})</h4>
          <div className="space-y-2">
            {outgoing.map((entry) => <BacklinkItem key={entry.id} entry={entry} incoming={false} onOpen={onOpenNode} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
