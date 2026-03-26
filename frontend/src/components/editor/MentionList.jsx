// Mention suggestion list used by TipTap Mention extension popup.
import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

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

const MentionList = forwardRef((props, ref) => {
  const { items = [], command } = props;
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Resets selection whenever mention result list changes.
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Triggers mention insertion command for selected item.
  const selectItem = (index) => {
    const item = items[index];
    if (!item) return;
    command({
      id: item.id,
      label: item.title,
      type: item.type
    });
  };

  // Exposes keyboard navigation handler to TipTap suggestion renderer.
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    }
  }));

  if (!items.length) {
    return <div className="p-2 text-xs text-amd-white/50">No matches</div>;
  }

  return (
    <div className="w-[340px] rounded-lg border border-white/10 bg-amd-gray shadow-xl overflow-hidden">
      {items.map((item, index) => (
        <button
          key={item.id}
          onClick={() => selectItem(index)}
          className={`w-full text-left px-3 py-2 border-b border-white/5 last:border-b-0 ${index === selectedIndex ? 'bg-amd-red/20' : 'hover:bg-amd-red/10'}`}
        >
          <div className="flex items-start gap-2">
            <span className={TYPE_COLOR[item.type] || 'text-amd-white/60'}>{TYPE_ICON[item.type] || '🔗'}</span>
            <div className="min-w-0">
              <div className="text-sm text-amd-white truncate">{item.title}</div>
              <div className="text-[11px] text-amd-white/45 truncate">{item.content_summary || 'No preview'}</div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = 'MentionList';

export default MentionList;
