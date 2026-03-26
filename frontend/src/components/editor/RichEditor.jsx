// TipTap rich text editor with collaboration and AI toolbar
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import { Mark } from '@tiptap/core';
import Tesseract from 'tesseract.js';
import * as Y from 'yjs';
import tippy from 'tippy.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Quote, Heading1, Heading2, Heading3, Sparkles, FileDown,
  Undo, Redo, Save, Link as LinkIcon, MessageCircle
} from 'lucide-react';
import useOllama from '../../hooks/useOllama';
import useStore from '../../store/useStore';
import toast from 'react-hot-toast';
import AIAssistPanel from './AIAssistPanel';
import { apiFetch } from '../../utils/apiClient';
import MentionList from './MentionList';
import BacklinksPanel from './BacklinksPanel';
import CommentsPanel from './CommentsPanel';
import axios from 'axios';

// TipTap mark extension used to track comment-highlighted text spans.
const CommentMark = Mark.create({
  name: 'comment',
  addAttributes() {
    return {
      commentId: { default: null },
      resolved: { default: false }
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', {
      ...HTMLAttributes,
      'data-comment-id': HTMLAttributes.commentId,
      class: HTMLAttributes.resolved ? 'comment-highlight resolved' : 'comment-highlight active'
    }, 0];
  }
});

export default function RichEditor({ content, onSave, docId, collabDoc }) {
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [aiAction, setAiAction] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const saveTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const editorRef = useRef(null);
  const latestDocRef = useRef({ json: null, text: '' });
  const saveCountRef = useRef(0);
  const ydocRef = useRef(collabDoc || new Y.Doc());
  const { selectedModel, setAiActive, workspace, user } = useStore();
  const [docNodeId, setDocNodeId] = useState(null);
  const [backlinksOpen, setBacklinksOpen] = useState(false);
  const [backlinksLoading, setBacklinksLoading] = useState(false);
  const [backlinks, setBacklinks] = useState({ incoming: [], outgoing: [], total: 0 });
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentDraftOpen, setCommentDraftOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');

  // Compacts Yjs history by reapplying current state into a clean document.
  const compactYDoc = useCallback(() => {
    const ydoc = ydocRef.current;
    const currentState = Y.encodeStateAsUpdate(ydoc);
    const freshDoc = new Y.Doc();
    Y.applyUpdate(freshDoc, currentState);
    ydoc.transact(() => {
      const snapshot = Y.encodeStateAsUpdate(freshDoc);
      Y.applyUpdate(ydoc, snapshot);
    });
  }, []);

  // Resolves graph node id associated with this document source id.
  const resolveDocNodeId = useCallback(async () => {
    if (!workspace?.id || !docId) {
      setDocNodeId(null);
      return null;
    }
    try {
      const res = await axios.get('/api/graph/nodes', { params: { workspace_id: workspace.id, all: 1 } });
      const node = (res.data.nodes || []).find((n) => n.type === 'doc' && n.source_id === docId);
      setDocNodeId(node?.id || null);
      return node?.id || null;
    } catch {
      setDocNodeId(null);
      return null;
    }
  }, [docId, workspace?.id]);

  // Fetches incoming/outgoing backlinks for current document graph node.
  const loadBacklinks = useCallback(async (nodeIdOverride) => {
    const nodeId = nodeIdOverride || docNodeId || await resolveDocNodeId();
    if (!nodeId) {
      setBacklinks({ incoming: [], outgoing: [], total: 0 });
      return;
    }
    setBacklinksLoading(true);
    try {
      const res = await axios.get(`/api/graph/backlinks/${nodeId}`);
      setBacklinks(res.data || { incoming: [], outgoing: [], total: 0 });
    } catch {
      setBacklinks({ incoming: [], outgoing: [], total: 0 });
    } finally {
      setBacklinksLoading(false);
    }
  }, [docNodeId, resolveDocNodeId]);

  // Loads threaded comments for the current document.
  const loadComments = useCallback(async () => {
    if (!docId) return;
    try {
      const res = await axios.get(`/api/comments/${docId}`);
      setComments(res.data.comments || []);
    } catch {
      setComments([]);
    }
  }, [docId]);

  // Jumps editor selection to a comment's recorded selection range.
  const jumpToComment = useCallback((comment) => {
    const activeEditor = editorRef.current;
    if (!activeEditor || !comment) return;
    const from = Number(comment.position_from || 0);
    const to = Number(comment.position_to || from + 1);
    if (from > 0 && to >= from) {
      activeEditor.chain().focus().setTextSelection({ from, to }).run();
    }
  }, []);

  // Posts a new top-level comment for the currently selected text range.
  const postComment = useCallback(async () => {
    const activeEditor = editorRef.current;
    if (!activeEditor || !docId || !workspace?.id || !commentDraft.trim()) return;
    const { from, to } = activeEditor.state.selection;
    const selectedText = activeEditor.state.doc.textBetween(from, to, ' ');
    try {
      const res = await axios.post('/api/comments', {
        document_id: docId,
        workspace_id: workspace.id,
        author_name: user?.name || 'Teammate',
        content: commentDraft.trim(),
        selected_text: selectedText || null,
        position_from: from,
        position_to: to
      });
      activeEditor.chain().focus().setMark('comment', { commentId: res.data.id, resolved: false }).run();
      setCommentDraft('');
      setCommentDraftOpen(false);
      loadComments();
    } catch {
      toast.error('Failed to add comment');
    }
  }, [commentDraft, docId, loadComments, user?.name, workspace?.id]);

  // Creates mention extension configured with semantic search and keyboard popup list.
  const MentionExtension = Mention.configure({
    HTMLAttributes: {
      class: 'ryflow-mention'
    },
    renderText({ node }) {
      return `@ ${node.attrs.label || node.attrs.id}`;
    },
    renderHTML({ node, HTMLAttributes }) {
      return ['span', {
        ...HTMLAttributes,
        'data-id': node.attrs.id,
        'data-type': node.attrs.type,
        class: 'ryflow-mention'
      }, `@ ${node.attrs.label || node.attrs.id}`];
    },
    suggestion: {
      char: '@',
      items: async ({ query }) => {
        if (query.length < 1 || !workspace?.id) return [];
        const res = await apiFetch('/api/graph/search', {
          method: 'POST',
          body: JSON.stringify({ query, workspace_id: workspace.id })
        });
        const data = await res.json();
        return (data.results || []).slice(0, 8);
      },
      render: () => {
        let component;
        let popup;
        return {
          onStart: (props) => {
            component = new ReactRenderer(MentionList, {
              props,
              editor: props.editor
            });
            popup = tippy('body', {
              getReferenceClientRect: props.clientRect,
              appendTo: () => document.body,
              content: component.element,
              showOnCreate: true,
              interactive: true,
              trigger: 'manual',
              placement: 'bottom-start'
            });
          },
          onUpdate: (props) => {
            component.updateProps(props);
            popup[0].setProps({ getReferenceClientRect: props.clientRect });
          },
          onKeyDown: (props) => {
            if (props.event.key === 'Escape') {
              popup[0].hide();
              return true;
            }
            return component.ref?.onKeyDown(props);
          },
          onExit: () => {
            popup[0].destroy();
            component.destroy();
          }
        };
      }
    }
  });

  // Converts a browser File into a base64 payload plus MIME type.
  const fileToBase64 = useCallback((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const [prefix = '', imageBase64 = ''] = dataUrl.split(',');
      const mimeType = (prefix.match(/data:(.*?);base64/) || [])[1] || file.type || 'image/png';
      resolve({ imageBase64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  }), []);

  // Converts an embedded image URL/data URL into a File for OCR processing.
  const imageSrcToFile = useCallback(async (src) => {
    const response = await fetch(src);
    const blob = await response.blob();
    const extension = (blob.type || 'image/png').split('/')[1] || 'png';
    return new File([blob], `embedded-image.${extension}`, { type: blob.type || 'image/png' });
  }, []);

  // Inserts OCR output at cursor with required label + blockquote structure.
  const insertExtractedText = useCallback((filename, text) => {
    const activeEditor = editorRef.current;
    if (!activeEditor) return;
    const cleanText = String(text || '').trim();
    activeEditor.chain().focus().insertContent([
      { type: 'paragraph', content: [{ type: 'text', text: `[Extracted from image: ${filename}]` }] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: cleanText }] }] }
    ]).run();
  }, []);

  // Calls server-side vision fallback OCR endpoint when local OCR quality is low.
  const runFallbackOCR = useCallback(async (file) => {
    const { imageBase64, mimeType } = await fileToBase64(file);
    try {
      setAiActive(true);
      const response = await apiFetch('/api/ai/ocr-fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'OCR fallback failed');
      }
      return String(data.text || '').trim();
    } finally {
      setAiActive(false);
    }
  }, [fileToBase64, setAiActive]);

  // Runs OCR extraction flow and inserts the extracted text into the editor.
  const processImageOCR = useCallback(async (file) => {
    if (!file || !editorRef.current) return;
    setOcrLoading(true);
    toast.loading('Extracting text...', { id: 'ocr-status' });
    try {
      const { data: { text } } = await Tesseract.recognize(file, 'eng', {
        logger: (m) => console.log('[OCR]', m)
      });
      const cleaned = String(text || '').trim();
      if (cleaned.length > 10) {
        insertExtractedText(file.name, cleaned);
        toast.success('✅ Text extracted and inserted', { id: 'ocr-status' });
        return;
      }

      const fallbackText = await runFallbackOCR(file);
      if (fallbackText.length > 10) {
        insertExtractedText(file.name, fallbackText);
        toast.success('⚡ AI-powered extraction used', { id: 'ocr-status' });
        return;
      }

      toast.error('❌ No text found in image', { id: 'ocr-status' });
    } catch {
      toast.error('❌ No text found in image', { id: 'ocr-status' });
    } finally {
      setOcrLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [insertExtractedText, runFallbackOCR]);

  // Handles toolbar OCR trigger for uploaded files and selected embedded images.
  const handleExtractTextFromImage = useCallback(async () => {
    const activeEditor = editorRef.current;
    if (!activeEditor) return;
    const selectedImageSrc = activeEditor.getAttributes('image')?.src;
    if (selectedImageSrc) {
      const embeddedFile = await imageSrcToFile(selectedImageSrc);
      await processImageOCR(embeddedFile);
      return;
    }
    fileInputRef.current?.click();
  }, [imageSrcToFile, processImageOCR]);

  // Embeds dropped image files directly into the TipTap document.
  const handleImageDrop = useCallback((view, event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    const imageFile = files.find((f) => f.type.startsWith('image/'));
    if (!imageFile) return false;

    event.preventDefault();
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      if (src) editorRef.current?.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(imageFile);
    return true;
  }, []);

  const editor = useEditor({
    extensions: [
      // Keep editor in local mode until full Yjs provider wiring is available.
      StarterKit,
      Highlight.configure({ multicolor: true }),
      Typography,
      Image,
      MentionExtension,
      CommentMark,
      Placeholder.configure({
        placeholder: 'Start writing... Use the AI toolbar to enhance your text ✨',
      }),
    ],
    content: content || '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[400px] p-4',
      },
      handleDrop: (view, event) => handleImageDrop(view, event),
    },
    onUpdate: ({ editor }) => {
      // Keep latest content snapshot so we can flush on unmount/doc switch.
      latestDocRef.current = {
        json: editor.getJSON(),
        text: editor.getText()
      };

      // Debounced autosave to avoid losing edits when users switch documents quickly.
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        if (onSave && latestDocRef.current.json) {
          await onSave(latestDocRef.current.json, latestDocRef.current.text);
          saveCountRef.current += 1;
          if (saveCountRef.current % 10 === 0) {
            compactYDoc();
          }
          loadBacklinks();
          loadComments();
        }
      }, 2000);
    },
  }, [CommentMark, MentionExtension, compactYDoc, loadBacklinks, loadComments, onSave]);

  // Keeps an imperative editor reference for async OCR handlers.
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Update editor content when prop changes
  useEffect(() => {
    if (editor && !editor.isFocused) {
      try {
        // Always sync selected document content to prevent stale/blank editor states.
        editor.commands.setContent(content || '');
      } catch {
        // Ignore malformed content payloads and keep editor usable.
      }
    }
  }, [content, editor]);

  // Resolves graph node id and linked data whenever current document changes.
  useEffect(() => {
    resolveDocNodeId().then((nodeId) => {
      if (nodeId) loadBacklinks(nodeId);
    });
    loadComments();
  }, [resolveDocNodeId, loadBacklinks, loadComments]);

  // Compacts large Yjs states on load if accumulated history exceeds threshold.
  useEffect(() => {
    const size = Y.encodeStateAsUpdate(ydocRef.current).length;
    if (size > 500 * 1024) {
      compactYDoc();
    }
  }, [compactYDoc, docId]);

  // Cleanup autosave timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Force a final save when leaving this editor instance.
      if (onSave && latestDocRef.current.json) {
        onSave(latestDocRef.current.json, latestDocRef.current.text);
      }
    };
  }, [onSave]);

  // Handles AI floating toolbar actions on selected text
  const handleAIAction = useCallback((action) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ');
    if (!text.trim()) {
      toast('Select some text first', { icon: '✏️' });
      return;
    }
    setSelectedText(text);
    setAiAction(action);
    setShowAIPanel(true);
  }, [editor]);

  // Applies AI-generated text back into the editor
  const applyAIResult = useCallback((result) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, result).run();
    setShowAIPanel(false);
    toast.success('AI text applied!');
  }, [editor]);

  // Manual save handler
  const handleSave = useCallback(() => {
    if (editor && onSave) {
      onSave(editor.getJSON(), editor.getText());
      toast.success('Document saved');
    }
  }, [editor, onSave]);

  // Exports document as markdown or plain text
  const handleExport = useCallback((format) => {
    if (!editor) return;
    let content, filename, type;
    if (format === 'markdown') {
      content = editor.getText(); // simplified markdown export
      filename = 'document.md';
      type = 'text/markdown';
    } else {
      content = editor.getText();
      filename = 'document.txt';
      type = 'text/plain';
    }
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported as ${format}`);
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-white/5 bg-amd-gray/30 rounded-t-xl flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) processImageOCR(file);
          }}
        />
        {/* Formatting buttons */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} icon={Bold} />
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} icon={Italic} />
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} icon={Strikethrough} />
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} icon={Code} />
        <div className="w-px h-5 bg-white/10 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} icon={Heading1} />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} icon={Heading2} />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} icon={Heading3} />
        <div className="w-px h-5 bg-white/10 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} icon={List} />
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} icon={ListOrdered} />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} icon={Quote} />
        <div className="w-px h-5 bg-white/10 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} icon={Undo} />
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} icon={Redo} />
        <div className="w-px h-5 bg-white/10 mx-1" />
        <ToolbarButton onClick={handleSave} icon={Save} tooltip="Save" />
        <div className="group relative">
          <ToolbarButton onClick={() => {}} icon={FileDown} tooltip="Export" />
          <div className="absolute top-full left-0 mt-1 hidden group-hover:block bg-amd-gray border border-white/10 rounded-lg overflow-hidden z-10">
            <button onClick={() => handleExport('markdown')} className="block w-full text-left px-3 py-2 text-xs hover:bg-white/5">MD</button>
            <button onClick={() => handleExport('text')} className="block w-full text-left px-3 py-2 text-xs hover:bg-white/5">TXT</button>
          </div>
        </div>
        <button
          onClick={handleExtractTextFromImage}
          disabled={ocrLoading}
          className="px-2 py-1 rounded text-xs bg-white/5 text-amd-white/70 hover:bg-white/10 disabled:opacity-50"
        >
          {ocrLoading ? 'Extracting text...' : '🖼 Extract Text from Image'}
        </button>
        <button
          onClick={() => { setBacklinksOpen((v) => !v); loadBacklinks(); }}
          className="px-2 py-1 rounded text-xs bg-white/5 text-amd-white/70 hover:bg-white/10 relative"
        >
          <LinkIcon size={12} className="inline mr-1" /> Backlinks
          {Number(backlinks.total || 0) > 0 ? <span className="ml-1 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-amd-red text-white text-[10px] px-1">{backlinks.total}</span> : null}
        </button>
        <button
          onClick={() => { setCommentsOpen((v) => !v); loadComments(); }}
          className="px-2 py-1 rounded text-xs bg-white/5 text-amd-white/70 hover:bg-white/10"
        >
          <MessageCircle size={12} className="inline mr-1" /> 💬 {comments.length}
        </button>

        {/* AI Actions */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => handleAIAction('improve')}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amd-red/10 text-amd-red hover:bg-amd-red/20 transition-colors"
          >
            <Sparkles size={12} /> Improve
          </button>
          <button
            onClick={() => handleAIAction('summarize')}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amd-red/10 text-amd-red hover:bg-amd-red/20 transition-colors"
          >
            📝 Summarize
          </button>
          <button
            onClick={() => handleAIAction('translate')}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amd-red/10 text-amd-red hover:bg-amd-red/20 transition-colors"
          >
            🌐 Translate
          </button>
          <button
            onClick={() => handleAIAction('expand')}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amd-red/10 text-amd-red hover:bg-amd-red/20 transition-colors"
          >
            ➕ Expand
          </button>
          <button
            onClick={() => setCommentDraftOpen((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amd-orange/15 text-amd-orange hover:bg-amd-orange/25 transition-colors"
          >
            💬 Comment
          </button>
          <button
            onClick={() => handleExport('markdown')}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-white/5 text-amd-white/60 hover:bg-white/10 transition-colors"
          >
            <FileDown size={12} /> Export
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-hidden bg-amd-charcoal rounded-b-xl flex">
        <div className="flex-1 overflow-auto">
          {commentDraftOpen ? (
            <div className="mx-3 mt-3 rounded border border-amd-orange/30 bg-amd-orange/10 p-2">
              <div className="text-[11px] text-amd-white/50 mb-1">Selected text:</div>
              <div className="text-xs italic text-amd-white/70 mb-2">{editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ') || 'No selection'}</div>
              <div className="flex gap-2">
                <input value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder="Write a comment" className="flex-1 bg-amd-gray/60 border border-white/10 rounded px-2 py-1 text-xs text-amd-white" />
                <button onClick={postComment} className="px-2 py-1 rounded bg-amd-red/20 text-amd-red text-xs">Post Comment</button>
              </div>
            </div>
          ) : null}
          <EditorContent editor={editor} />
        </div>
        <BacklinksPanel
          open={backlinksOpen}
          loading={backlinksLoading}
          backlinks={backlinks}
          onClose={() => setBacklinksOpen(false)}
          onOpenNode={(entry) => {
            const sid = entry?.source_id;
            if (!sid) return;
            if (entry.type === 'doc') window.location.href = `/editor/${sid}`;
            else if (entry.type === 'task') window.location.href = '/tasks';
            else if (entry.type === 'code') window.location.href = `/code/${sid}`;
            else if (entry.type === 'canvas') window.location.href = `/canvas/${sid}`;
          }}
        />
        <CommentsPanel
          open={commentsOpen}
          comments={comments}
          onRefresh={loadComments}
          documentId={docId}
          workspaceId={workspace?.id}
          authorName={user?.name || 'Teammate'}
          onJumpTo={jumpToComment}
        />
      </div>

      {/* AI Assist Panel */}
      <AnimatePresence>
        {showAIPanel && (
          <AIAssistPanel
            text={selectedText}
            action={aiAction}
            onApply={applyAIResult}
            onClose={() => setShowAIPanel(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Reusable toolbar button component
function ToolbarButton({ onClick, active, icon: Icon, tooltip }) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`p-1.5 rounded transition-colors ${
        active ? 'bg-amd-red/20 text-amd-red' : 'text-amd-white/60 hover:text-amd-white hover:bg-white/5'
      }`}
    >
      <Icon size={16} />
    </button>
  );
}
