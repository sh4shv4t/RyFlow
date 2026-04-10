import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Sparkles,
  Link2,
  Save,
  MessageSquare
} from 'lucide-react';
import useStore from '../../store/useStore';
import { formatRelativeTime } from '../../utils/time';
import { apiFetch } from '../../utils/apiClient';
import useCollaboration from '../../hooks/useCollaboration';
import AIAssistPanel from './AIAssistPanel';
import BacklinksPanel from './BacklinksPanel';
import CommentsPanel from './CommentsPanel';
import InlineTagPicker from '../shared/InlineTagPicker';

function parseContent(raw) {
  if (!raw) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph' }]
    };
  }

  if (typeof raw === 'object' && raw.type === 'doc') {
    return raw;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.type === 'doc') return parsed;
    } catch {
      // Fall through to plain-text fallback.
    }

    if (raw.trim()) {
      return {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: raw }]
        }]
      };
    }
  }

  return {
    type: 'doc',
    content: [{ type: 'paragraph' }]
  };
}

function toolbarButtonStyle(active) {
  if (active) {
    return {
      width: '28px',
      height: '28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(232, 0, 13, 0.12)',
      border: '1px solid rgba(232, 0, 13, 0.25)',
      borderRadius: '4px',
      color: '#E8000D',
      cursor: 'pointer'
    };
  }

  return {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: 'var(--text-tertiary)',
    cursor: 'pointer'
  };
}

function featureButtonStyle(active, kind = 'default') {
  if (active && kind === 'ai') {
    return {
      height: '28px',
      padding: '0 10px',
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      background: 'rgba(139,92,246,0.12)',
      border: '1px solid rgba(139,92,246,0.3)',
      borderRadius: '4px',
      color: '#8B5CF6',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 500
    };
  }

  if (active && kind === 'links') {
    return {
      height: '28px',
      padding: '0 10px',
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      background: 'rgba(232,0,13,0.08)',
      border: '1px solid rgba(232,0,13,0.2)',
      borderRadius: '4px',
      color: '#E8000D',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 500
    };
  }

  if (active && kind === 'comments') {
    return {
      height: '28px',
      padding: '0 10px',
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      background: 'rgba(255,107,0,0.08)',
      border: '1px solid rgba(255,107,0,0.2)',
      borderRadius: '4px',
      color: '#FF6B00',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 500
    };
  }

  return {
    height: '28px',
    padding: '0 10px',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '4px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500
  };
}

function PanelShell({ panelTitle, onClose, headerBg, accentColor, children }) {
  return (
    <div
      className="slide-in-right"
      style={{
        width: '300px',
        flexShrink: 0,
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          background: headerBg,
          borderLeft: `3px solid ${accentColor}`
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}
        >
          {panelTitle}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            padding: '2px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center'
          }}
          title="Close panel"
        >
          +�
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

export default function RichEditor({ doc, workspaceId, onDocUpdate }) {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const userName = user?.name || 'Teammate';

  const [title, setTitle] = useState(doc?.title || 'Untitled');
  const [saveStatus, setSaveStatus] = useState('');
  const [lastSaved, setLastSaved] = useState(null);

  const [showAI, setShowAI] = useState(false);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const [aiAction, setAiAction] = useState('improve');
  const [selectedText, setSelectedText] = useState('');

  const [comments, setComments] = useState([]);
  const [backlinks, setBacklinks] = useState({ incoming: [], outgoing: [], total: 0 });
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [backlinksLoading, setBacklinksLoading] = useState(false);

  const saveTimerRef = useRef(null);
  const isSavingRef = useRef(false);
  const docIdRef = useRef(doc?.id || null);
  const seededCollabDocRef = useRef(null);

  const { ydoc, provider } = useCollaboration({
    workspaceId,
    docId: doc?.id
  });

  const collaborationEnabled = Boolean(ydoc && provider && workspaceId && doc?.id);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: collaborationEnabled ? false : { depth: 50 } }),
      Placeholder.configure({ placeholder: 'Start writing...' }),
      ...(collaborationEnabled
        ? [
            Collaboration.configure({ document: ydoc }),
            CollaborationCursor.configure({
              provider,
              user: {
                name: userName,
                color: user?.avatar_color || '#E8000D'
              }
            })
          ]
        : [])
    ],
    content: collaborationEnabled ? undefined : parseContent(doc?.content),
    editorProps: {
      attributes: {
        class: 'ryflow-editor-content',
        spellcheck: 'true'
      }
    },
    onUpdate: () => {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveDoc(false);
      }, 30000);
    }
  }, [doc?.id, collaborationEnabled, provider, ydoc, userName, user?.avatar_color]);

  useEffect(() => {
    setTitle(doc?.title || 'Untitled');
    docIdRef.current = doc?.id || null;
    seededCollabDocRef.current = null;
  }, [doc?.id, doc?.title]);

  useEffect(() => {
    if (!editor || !doc || collaborationEnabled) return;
    const incoming = parseContent(doc.content);
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(incoming)) {
      editor.commands.setContent(incoming, false);
    }
  }, [doc?.id, doc?.content, editor, doc, collaborationEnabled]);

  useEffect(() => {
    if (!editor || !doc?.id || !ydoc || !collaborationEnabled) return;
    if (seededCollabDocRef.current === doc.id) return;

    const fragment = ydoc.getXmlFragment('default');
    if (fragment.length === 0) {
      editor.commands.setContent(parseContent(doc.content), false);
    }
    seededCollabDocRef.current = doc.id;
  }, [collaborationEnabled, doc?.id, doc?.content, editor, ydoc]);

  const saveDoc = useCallback(async (manual = false) => {
    if (!editor || isSavingRef.current || !docIdRef.current) return;

    isSavingRef.current = true;
    if (manual) setSaveStatus('Saving...');

    try {
      const content = JSON.stringify(editor.getJSON());
      const res = await apiFetch(`/api/docs/${docIdRef.current}`, {
        method: 'PUT',
        body: JSON.stringify({ title, content, workspace_id: workspaceId })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Save failed');
      }

      const updated = await res.json();
      onDocUpdate?.(updated);
      setLastSaved(new Date());

      if (manual) {
        setSaveStatus('Saved');
        setTimeout(() => setSaveStatus(''), 1200);
      }
    } catch (err) {
      console.error('[RichEditor] save error:', err);
      if (manual) {
        setSaveStatus('Save failed');
        setTimeout(() => setSaveStatus(''), 3000);
      }
    } finally {
      isSavingRef.current = false;
    }
  }, [editor, onDocUpdate, title, workspaceId]);

  const refreshComments = useCallback(async () => {
    if (!doc?.id) {
      setComments([]);
      return;
    }

    setCommentsLoading(true);
    try {
      const res = await apiFetch(`/api/comments/${doc.id}?include_resolved=true`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load comments');
      setComments(Array.isArray(data?.comments) ? data.comments : []);
    } catch (err) {
      console.error('[RichEditor] comments error:', err);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [doc?.id]);

  const refreshBacklinks = useCallback(async () => {
    if (!workspaceId || !doc?.id) {
      setBacklinks({ incoming: [], outgoing: [], total: 0 });
      return;
    }

    setBacklinksLoading(true);
    try {
      const nodesRes = await apiFetch(`/api/graph/nodes?workspace_id=${workspaceId}&all=1`);
      const nodesData = await nodesRes.json().catch(() => ({}));
      const node = (nodesData?.nodes || []).find((n) => n.type === 'doc' && n.source_id === doc.id);

      if (!node?.id) {
        setBacklinks({ incoming: [], outgoing: [], total: 0 });
        return;
      }

      const blRes = await apiFetch(`/api/graph/backlinks/${node.id}`);
      const blData = await blRes.json().catch(() => ({}));
      setBacklinks(blData || { incoming: [], outgoing: [], total: 0 });
    } catch (err) {
      console.error('[RichEditor] backlinks error:', err);
      setBacklinks({ incoming: [], outgoing: [], total: 0 });
    } finally {
      setBacklinksLoading(false);
    }
  }, [doc?.id, workspaceId]);

  useEffect(() => {
    if (showComments) refreshComments();
  }, [showComments, refreshComments]);

  useEffect(() => {
    if (showBacklinks) refreshBacklinks();
  }, [showBacklinks, refreshBacklinks]);

  useEffect(() => {
    if (!lastSaved) return;
    const interval = setInterval(() => {
      setLastSaved((prev) => (prev ? new Date(prev) : null));
    }, 30000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveDoc(true);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [saveDoc]);

  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
    };
  }, []);

  const aiText = useMemo(() => {
    if (!editor) return '';
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, ' ') || '';
  }, [editor, selectedText]);

  const openAI = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      setSaveStatus('Select text for AI assist');
      setTimeout(() => setSaveStatus(''), 1800);
      return;
    }

    setSelectedText(String(Date.now()));
    setShowAI(true);
    setShowBacklinks(false);
    setShowComments(false);
  }, [editor]);

  const applyAIResult = useCallback((result) => {
    if (!editor || !result) return;
    const { from, to } = editor.state.selection;
    editor.chain().focus().deleteRange({ from, to }).insertContent(result).run();
    setShowAI(false);
  }, [editor]);

  const addComment = useCallback(async () => {
    if (!editor || !doc?.id || !workspaceId) return;

    const { from, to } = editor.state.selection;
    if (from === to) {
      setSaveStatus('Select text first');
      setTimeout(() => setSaveStatus(''), 1500);
      return;
    }

    const selected = editor.state.doc.textBetween(from, to, ' ');
    const content = window.prompt('Add comment');
    if (!content || !content.trim()) return;

    try {
      const res = await apiFetch('/api/comments', {
        method: 'POST',
        body: JSON.stringify({
          document_id: doc.id,
          workspace_id: workspaceId,
          author_name: userName,
          content: content.trim(),
          selected_text: selected,
          position_from: from,
          position_to: to
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to add comment');

      setShowComments(true);
      refreshComments();
      setSaveStatus('Comment added');
      setTimeout(() => setSaveStatus(''), 1500);
    } catch (err) {
      console.error('[RichEditor] add comment error:', err);
      setSaveStatus('Comment failed');
      setTimeout(() => setSaveStatus(''), 1500);
    }
  }, [doc?.id, editor, refreshComments, userName, workspaceId]);

  const jumpToComment = useCallback((comment) => {
    if (!editor) return;
    const from = Number(comment?.position_from);
    const to = Number(comment?.position_to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    editor.chain().focus().setTextSelection({ from, to }).run();
  }, [editor]);

  if (!editor) return null;

  const panelOpen = showAI || showBacklinks || showComments;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-base)',
        overflow: 'hidden',
        borderLeft: panelOpen ? '2px solid rgba(139,92,246,0.3)' : 'none'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          padding: '0 16px',
          height: '40px',
          minHeight: '40px',
          flexShrink: 0,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          overflow: 'hidden'
        }}
      >
        {[
          {
            icon: <Bold size={14} />,
            action: () => editor.chain().focus().toggleBold().run(),
            active: editor.isActive('bold'),
            title: 'Bold'
          },
          {
            icon: <Italic size={14} />,
            action: () => editor.chain().focus().toggleItalic().run(),
            active: editor.isActive('italic'),
            title: 'Italic'
          }
        ].map((btn, i) => (
          <button
            key={i}
            onMouseDown={(e) => {
              e.preventDefault();
              btn.action();
            }}
            title={btn.title}
            style={toolbarButtonStyle(btn.active)}
            onMouseEnter={(e) => {
              if (!btn.active) {
                e.currentTarget.style.background = 'var(--bg-elevated)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!btn.active) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-tertiary)';
              }
            }}
          >
            {btn.icon}
          </button>
        ))}

        <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)', margin: '0 4px', flexShrink: 0 }} />

        {[
          { label: 'H1', level: 1 },
          { label: 'H2', level: 2 },
          { label: 'H3', level: 3 }
        ].map((h) => {
          const active = editor.isActive('heading', { level: h.level });
          return (
            <button
              key={h.level}
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().toggleHeading({ level: h.level }).run();
              }}
              title={`Heading ${h.level}`}
              style={{
                ...toolbarButtonStyle(active),
                width: '34px',
                fontSize: '11px',
                fontWeight: 600
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'var(--bg-elevated)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-tertiary)';
                }
              }}
            >
              {h.label}
            </button>
          );
        })}

        <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)', margin: '0 4px', flexShrink: 0 }} />

        {[
          {
            icon: <List size={14} />,
            action: () => editor.chain().focus().toggleBulletList().run(),
            active: editor.isActive('bulletList'),
            title: 'Bullet list'
          },
          {
            icon: <ListOrdered size={14} />,
            action: () => editor.chain().focus().toggleOrderedList().run(),
            active: editor.isActive('orderedList'),
            title: 'Numbered list'
          },
          {
            icon: <Quote size={14} />,
            action: () => editor.chain().focus().toggleBlockquote().run(),
            active: editor.isActive('blockquote'),
            title: 'Quote'
          },
          {
            icon: <Code size={14} />,
            action: () => editor.chain().focus().toggleCodeBlock().run(),
            active: editor.isActive('codeBlock'),
            title: 'Code block'
          }
        ].map((btn, i) => (
          <button
            key={i}
            onMouseDown={(e) => {
              e.preventDefault();
              btn.action();
            }}
            title={btn.title}
            style={toolbarButtonStyle(btn.active)}
            onMouseEnter={(e) => {
              if (!btn.active) {
                e.currentTarget.style.background = 'var(--bg-elevated)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!btn.active) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-tertiary)';
              }
            }}
          >
            {btn.icon}
          </button>
        ))}

        <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)', margin: '0 4px', flexShrink: 0 }} />

        <button
          onClick={openAI}
          title="AI Assist"
          style={featureButtonStyle(showAI, 'ai')}
        >
          <Sparkles size={13} /> AI
        </button>

        <button
          onClick={() => {
            setShowBacklinks((v) => !v);
            setShowAI(false);
            setShowComments(false);
          }}
          title="Backlinks"
          style={featureButtonStyle(showBacklinks, 'links')}
        >
          <Link2 size={13} /> Links
        </button>

        <button
          onClick={() => {
            setShowComments((v) => !v);
            setShowAI(false);
            setShowBacklinks(false);
          }}
          title="Comments"
          style={featureButtonStyle(showComments, 'comments')}
        >
          <MessageSquare size={13} /> Comments
        </button>

        <button
          onClick={addComment}
          title="Add comment to selection"
          style={{
            height: '28px',
            padding: '0 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: 'transparent',
            border: '1px solid var(--border-default)',
            borderRadius: '4px',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            fontSize: '12px',
            flexShrink: 0
          }}
        >
          + Comment
        </button>

        <div style={{ flex: 1, minWidth: 8 }} />

        {lastSaved && (
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-tertiary)',
              marginRight: '8px',
              flexShrink: 0
            }}
          >
            Saved {formatRelativeTime(lastSaved)}
          </span>
        )}

        {saveStatus && (
          <span
            style={{
              fontSize: '11px',
              color: saveStatus === 'Save failed' ? 'var(--error)' : 'var(--text-tertiary)',
              marginRight: '8px'
            }}
          >
            {saveStatus}
          </span>
        )}

        <button
          onClick={() => saveDoc(true)}
          title="Save (Ctrl+S)"
          style={{
            height: '28px',
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '4px',
            color: 'var(--text-on-accent)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            flexShrink: 0
          }}
        >
          <Save size={13} /> Save
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '48px 56px' }}>
          <div style={{ maxWidth: '680px', margin: '0 auto' }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled"
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid transparent',
                outline: 'none',
                fontSize: '28px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '8px',
                fontFamily: 'inherit',
                lineHeight: 1.2,
                padding: '0 0 8px 0',
                transition: 'border-color 150ms ease'
              }}
              onFocus={(e) => {
                e.target.style.borderBottomColor = 'var(--border-default)';
              }}
              onBlur={(e) => {
                e.target.style.borderBottomColor = 'transparent';
                saveDoc(false);
              }}
            />

            {doc?.id && workspaceId && (
              <div style={{ marginBottom: '16px' }}>
                <InlineTagPicker
                  workspaceId={workspaceId}
                  nodeSourceId={doc.id}
                  nodeType="doc"
                />
              </div>
            )}

            <div
              style={{
                height: '1px',
                background: 'var(--border-subtle)',
                marginBottom: '24px',
                marginTop: '4px'
              }}
            />

            <EditorContent editor={editor} />
          </div>
        </div>

        {showAI && (
          <PanelShell
            panelTitle="G�� AI Assist"
            onClose={() => setShowAI(false)}
            headerBg="rgba(139,92,246,0.06)"
            accentColor="#8B5CF6"
          >
            <AIAssistPanel
              text={aiText}
              action={aiAction}
              onApply={applyAIResult}
              onClose={() => setShowAI(false)}
              embedded
            />
          </PanelShell>
        )}

        {showBacklinks && (
          <PanelShell
            panelTitle="=��� Backlinks"
            onClose={() => setShowBacklinks(false)}
            headerBg="rgba(232,0,13,0.06)"
            accentColor="#E8000D"
          >
            <BacklinksPanel
              open
              loading={backlinksLoading}
              backlinks={backlinks}
              onClose={() => setShowBacklinks(false)}
              onOpenNode={(entry) => {
                if (!entry) return;
                if (entry.type === 'doc' && entry.source_id) navigate(`/editor/${entry.source_id}`);
                else if (entry.type === 'code') navigate(entry.source_id ? `/code/${entry.source_id}` : '/code');
                else if (entry.type === 'canvas') navigate(entry.source_id ? `/canvas/${entry.source_id}` : '/canvas');
              }}
              embedded
            />
          </PanelShell>
        )}

        {showComments && (
          <PanelShell
            panelTitle="=�Ƽ Comments"
            onClose={() => setShowComments(false)}
            headerBg="rgba(255,107,0,0.06)"
            accentColor="#FF6B00"
          >
            <CommentsPanel
              open
              comments={comments}
              onRefresh={refreshComments}
              documentId={doc?.id}
              workspaceId={workspaceId}
              authorName={userName}
              onJumpTo={jumpToComment}
              embedded
              loading={commentsLoading}
            />
          </PanelShell>
        )}
      </div>
    </div>
  );
}
