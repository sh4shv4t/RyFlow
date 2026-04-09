export function SkeletonLine({
  width = '100%',
  height = 13,
  style = {}
}) {
  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius: '3px',
        ...style
      }}
    />
  );
}

export function SkeletonAvatar({ size = 28 }) {
  return (
    <div className="skeleton" style={{
      width: size, height: size,
      borderRadius: '50%', flexShrink: 0
    }} />
  );
}

export function SkeletonBadge() {
  return (
    <div className="skeleton" style={{
      width: 48, height: 18, borderRadius: 10,
      flexShrink: 0
    }} />
  );
}

export function DocumentRowSkeleton() {
  const widths = [72, 55, 68, 80, 58, 65, 75];
  const w = widths[
    Math.floor(Math.random() * widths.length)
  ];
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      gap: '10px', height: '44px',
      padding: '0 20px',
      borderBottom: '1px solid var(--border-subtle)'
    }}>
      <div className="skeleton" style={{
        width: 14, height: 14,
        borderRadius: 3, flexShrink: 0
      }} />
      <div className="skeleton" style={{
        width: `${w}%`, height: 13,
        borderRadius: 3
      }} />
      <div style={{ marginLeft: 'auto',
        flexShrink: 0 }}>
        <div className="skeleton" style={{
          width: 60, height: 10, borderRadius: 3
        }} />
      </div>
    </div>
  );
}

export function TaskCardSkeleton() {
  const widths = [70, 80, 62, 75, 58];
  const w = widths[
    Math.floor(Math.random() * widths.length)
  ];
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 6,
      padding: '12px 14px',
      marginBottom: 6
    }}>
      <div className="skeleton" style={{
        width: `${w}%`, height: 13,
        borderRadius: 3, marginBottom: 10
      }} />
      <div style={{
        display: 'flex',
        alignItems: 'center', gap: 6
      }}>
        <SkeletonAvatar size={20} />
        <SkeletonBadge />
        <div style={{ marginLeft: 'auto' }}>
          <div className="skeleton" style={{
            width: 50, height: 10, borderRadius: 3
          }} />
        </div>
      </div>
    </div>
  );
}

export function ActivityRowSkeleton() {
  const widths = [55, 68, 42, 75, 60];
  const w = widths[
    Math.floor(Math.random() * widths.length)
  ];
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      gap: 10, height: 36, padding: '0 8px'
    }}>
      <div className="skeleton" style={{
        width: 14, height: 14,
        borderRadius: 3, flexShrink: 0
      }} />
      <div className="skeleton" style={{
        width: `${w}%`, height: 12, borderRadius: 3
      }} />
      <SkeletonBadge />
      <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
        <div className="skeleton" style={{
          width: 40, height: 10, borderRadius: 3
        }} />
      </div>
    </div>
  );
}

export function ChatListSkeleton() {
  const widths = [60, 45, 72, 55, 65];
  const w = widths[
    Math.floor(Math.random() * widths.length)
  ];
  return (
    <div style={{ padding: '8px 12px',
      marginBottom: 1 }}>
      <div className="skeleton" style={{
        width: `${w}%`, height: 13,
        borderRadius: 3, marginBottom: 6
      }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <SkeletonBadge />
        <div className="skeleton" style={{
          width: 40, height: 10, borderRadius: 3
        }} />
      </div>
    </div>
  );
}

export function CodeFileRowSkeleton() {
  const widths = [55, 68, 42, 75, 50];
  const w = widths[
    Math.floor(Math.random() * widths.length)
  ];
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      gap: 8, height: 36, padding: '0 12px',
      borderBottom: '1px solid var(--border-subtle)'
    }}>
      <div className="skeleton" style={{
        width: 14, height: 14,
        borderRadius: 3, flexShrink: 0
      }} />
      <div className="skeleton" style={{
        width: `${w}%`, height: 12, borderRadius: 3
      }} />
      <div style={{ marginLeft: 'auto',
        flexShrink: 0 }}>
        <SkeletonBadge />
      </div>
    </div>
  );
}

export function GraphLoadingSkeleton() {
  const nodes = [
    { x: 200, y: 150, r: 10 },
    { x: 90,  y: 80,  r: 7  },
    { x: 310, y: 90,  r: 8  },
    { x: 130, y: 230, r: 6  },
    { x: 270, y: 220, r: 7  },
    { x: 370, y: 160, r: 6  },
    { x: 50,  y: 190, r: 5  },
    { x: 240, y: 60,  r: 6  }
  ];
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 16
    }}>
      <div style={{
        position: 'relative',
        width: 420, height: 320
      }}>
        {nodes.map((n, i) => (
          <div key={i} className="skeleton" style={{
            position: 'absolute',
            width: n.r * 2, height: n.r * 2,
            borderRadius: '50%',
            left: n.x - n.r, top: n.y - n.r,
            animationDelay: `${i * 0.12}s`
          }} />
        ))}
      </div>
      <p style={{
        fontSize: 12,
        color: 'var(--text-tertiary)', margin: 0
      }}>
        Building knowledge graph...
      </p>
    </div>
  );
}

export function EditorSkeleton() {
  const lineWidths = [
    45, 100, 85, 92, 70, 100, 78, 95,
    60, 100, 88, 74, 100, 65, 90
  ];
  return (
    <div style={{
      padding: '48px 56px',
      background: 'var(--bg-base)',
      height: '100%', overflowY: 'auto'
    }}>
      <div style={{
        maxWidth: 680, margin: '0 auto'
      }}>
        <div className="skeleton" style={{
          width: '42%', height: 28,
          borderRadius: 4, marginBottom: 28
        }} />
        {lineWidths.map((w, i) => (
          <div key={i} className="skeleton" style={{
            width: `${w}%`, height: 14,
            borderRadius: 3,
            marginBottom: w === 45 ? 20 : 10,
            animationDelay: `${i * 0.04}s`
          }} />
        ))}
      </div>
    </div>
  );
}

export function SidebarWorkspaceSkeleton() {
  return (
    <div className="skeleton" style={{
      width: 110, height: 11,
      borderRadius: 3, marginLeft: 34
    }} />
  );
}

export function ListSkeleton({
  rows = 6,
  RowComponent = DocumentRowSkeleton
}) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <RowComponent key={i} />
      ))}
    </div>
  );
}
