import React from 'react';

const TYPE_COLOR = {
  doc: '#E8000D',
  task: '#FF6B00',
  code: '#3B82F6',
  canvas: '#10B981',
  ai_chat: '#8B5CF6',
  voice: '#22C55E'
};

function renderTypeBadge(type) {
  const color = TYPE_COLOR[type] || 'var(--text-tertiary)';
  return (
    <span
      style={{
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color,
        border: `1px solid ${color}55`,
        background: `${color}1A`,
        borderRadius: '10px',
        padding: '1px 6px',
        flexShrink: 0
      }}
    >
      {type || 'node'}
    </span>
  );
}

function BacklinkRow({ entry, onOpen }) {
  const color = TYPE_COLOR[entry.type] || 'var(--text-tertiary)';
  return (
    <div
      onClick={() => onOpen?.(entry)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 0',
        borderBottom: '1px solid var(--border-subtle)',
        cursor: 'pointer'
      }}
    >
      <span style={{ fontSize: '14px', color, flexShrink: 0 }}>●</span>
      <span
        style={{
          fontSize: '13px',
          color: 'var(--text-primary)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {entry.title || 'Untitled'}
      </span>
      {renderTypeBadge(entry.type)}
      <span
        style={{
          fontSize: '11px',
          color: 'var(--text-tertiary)',
          flexShrink: 0,
          maxWidth: '90px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {entry.relationship_label || 'related'}
      </span>
    </div>
  );
}

export default function BacklinksPanel({ open, loading, backlinks, onOpenNode, embedded }) {
  if (!open && !embedded) return null;

  const incoming = backlinks?.incoming || [];
  const outgoing = backlinks?.outgoing || [];

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      padding: '16px',
      boxSizing: 'border-box'
    }}>
      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
          Loading backlinks...
        </div>
      ) : null}

      {!loading && incoming.length === 0 && outgoing.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
          No connections yet.
        </div>
      ) : null}

      <section style={{ marginBottom: '14px' }}>
        <div style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-tertiary)',
          marginBottom: '6px'
        }}>
          Referenced By ({incoming.length})
        </div>
        {incoming.map((entry) => (
          <BacklinkRow key={`in-${entry.id}`} entry={entry} onOpen={onOpenNode} />
        ))}
      </section>

      <section>
        <div style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-tertiary)',
          marginBottom: '6px'
        }}>
          References ({outgoing.length})
        </div>
        {outgoing.map((entry) => (
          <BacklinkRow key={`out-${entry.id}`} entry={entry} onOpen={onOpenNode} />
        ))}
      </section>
    </div>
  );
}
