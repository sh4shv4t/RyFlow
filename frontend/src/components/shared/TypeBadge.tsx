import { NodeType, NODE_COLORS } from '../../types';

interface TypeBadgeProps {
  type: NodeType | string;
  size?: 'sm' | 'md';
}

const TYPE_LABELS: Record<string, string> = {
  document: 'DOC',
  task: 'TASK',
  code: 'CODE',
  canvas: 'CANVAS',
  ai_chat: 'CHAT',
  voice: 'VOICE'
};

export default function TypeBadge({ type, size = 'sm' }: TypeBadgeProps) {
  const color = NODE_COLORS[type as NodeType] || '#888888';
  const label = TYPE_LABELS[type] || String(type || 'item').toUpperCase();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: size === 'sm' ? '1px 5px' : '2px 8px',
        background: `${color}18`,
        border: `1px solid ${color}35`,
        borderRadius: 2,
        fontSize: size === 'sm' ? 10 : 11,
        fontWeight: 600,
        color,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        flexShrink: 0,
        fontFamily: 'inherit'
      }}
    >
      {label}
    </span>
  );
}
