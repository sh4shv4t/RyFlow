// Document comments panel with threaded replies and resolve filtering.
import React, { useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

// Builds relative timestamps for comment cards.
function timeAgo(iso) {
  if (!iso) return 'just now';
  const delta = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(delta / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Renders one comment card including nested replies.
function CommentCard({ item, depth, onReply, onResolve, onJump, onDelete }) {
  const [replyText, setReplyText] = useState('');
  const [replyOpen, setReplyOpen] = useState(false);

  return (
    <div className={`rounded-lg border ${item.resolved ? 'border-white/10 bg-white/5 opacity-70' : 'border-amd-orange/30 bg-amd-orange/10'} p-2`} style={{ marginLeft: depth * 14 }}>
      <button onClick={() => onJump(item)} className="w-full text-left">
        <div className="flex items-center justify-between">
          <span className="text-xs text-amd-white font-medium">{item.author_name}</span>
          <span className="text-[10px] text-amd-white/45">{timeAgo(item.created_at)}</span>
        </div>
        {item.selected_text ? <div className="text-[11px] italic text-amd-white/55 mt-1">"{item.selected_text}"</div> : null}
        <div className="text-xs text-amd-white/80 mt-1">{item.content}</div>
      </button>

      <div className="flex items-center gap-2 mt-2">
        <button onClick={() => setReplyOpen((v) => !v)} className="text-[11px] text-amd-white/60 hover:text-amd-white">Reply</button>
        <button onClick={() => onResolve(item.id)} className="text-[11px] text-amd-orange hover:text-amd-white">{item.resolved ? 'Reopen' : 'Resolve'}</button>
        <button onClick={() => onDelete(item.id)} className="text-[11px] text-amd-red hover:text-amd-white">Delete</button>
      </div>

      {replyOpen ? (
        <div className="mt-2 flex gap-1">
          <input value={replyText} onChange={(e) => setReplyText(e.target.value)} className="flex-1 bg-amd-gray/60 border border-white/10 rounded px-2 py-1 text-xs text-amd-white" placeholder="Write a reply" />
          <button
            onClick={() => {
              if (!replyText.trim()) return;
              onReply(item.id, replyText.trim());
              setReplyText('');
              setReplyOpen(false);
            }}
            className="px-2 py-1 rounded bg-amd-red/20 text-amd-red text-xs"
          >Post</button>
        </div>
      ) : null}

      {Array.isArray(item.replies) && item.replies.length > 0 ? (
        <div className="space-y-2 mt-2">
          {item.replies.map((reply) => (
            <CommentCard
              key={reply.id}
              item={reply}
              depth={depth + 1}
              onReply={onReply}
              onResolve={onResolve}
              onJump={onJump}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function CommentsPanel({ open, comments = [], onRefresh, documentId, workspaceId, authorName, onJumpTo }) {
  const [filter, setFilter] = useState('open');

  // Filters comments by open/resolved/all tabs.
  const filtered = useMemo(() => {
    if (filter === 'all') return comments;
    if (filter === 'resolved') return comments.filter((c) => c.resolved);
    return comments.filter((c) => !c.resolved);
  }, [comments, filter]);

  // Posts a reply under parent comment id.
  const postReply = async (parentId, content) => {
    try {
      await axios.post('/api/comments', {
        document_id: documentId,
        workspace_id: workspaceId,
        author_name: authorName,
        content,
        parent_id: parentId
      });
      onRefresh?.();
    } catch {
      toast.error('Failed to post reply');
    }
  };

  // Toggles resolved status for comment thread item.
  const toggleResolve = async (commentId) => {
    try {
      await axios.patch(`/api/comments/${commentId}/resolve`);
      onRefresh?.();
    } catch {
      toast.error('Failed to update comment status');
    }
  };

  // Removes selected comment item.
  const deleteComment = async (commentId) => {
    try {
      await axios.delete(`/api/comments/${commentId}`);
      onRefresh?.();
    } catch {
      toast.error('Failed to delete comment');
    }
  };

  if (!open) return null;

  return (
    <div className="w-[360px] border-l border-white/10 bg-amd-charcoal/95 p-3 overflow-auto">
      <h3 className="font-heading text-amd-white mb-2">Comments</h3>
      <div className="flex gap-1 mb-3">
        {['open', 'resolved', 'all'].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-2 py-1 text-xs rounded ${filter === tab ? 'bg-amd-red/20 text-amd-red' : 'bg-white/10 text-amd-white/60'}`}
          >{tab[0].toUpperCase() + tab.slice(1)}</button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((item) => (
          <CommentCard
            key={item.id}
            item={item}
            depth={0}
            onReply={postReply}
            onResolve={toggleResolve}
            onJump={onJumpTo}
            onDelete={deleteComment}
          />
        ))}
        {filtered.length === 0 ? <div className="text-xs text-amd-white/45">No comments in this view.</div> : null}
      </div>
    </div>
  );
}
