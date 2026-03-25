// TipTap rich text editor with collaboration and AI toolbar
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Tesseract from 'tesseract.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Quote, Heading1, Heading2, Heading3, Sparkles, FileDown,
  Undo, Redo, Save
} from 'lucide-react';
import useOllama from '../../hooks/useOllama';
import useStore from '../../store/useStore';
import toast from 'react-hot-toast';
import AIAssistPanel from './AIAssistPanel';

export default function RichEditor({ content, onSave, docId, collabDoc }) {
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [aiAction, setAiAction] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const saveTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const editorRef = useRef(null);
  const latestDocRef = useRef({ json: null, text: '' });
  const { selectedModel, setAiActive } = useStore();
  const API_BASE = (window.location.protocol === 'file:' || window.electronAPI?.isElectron)
    ? 'http://localhost:3001'
    : '';

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
      const response = await fetch(`${API_BASE}/api/ai/ocr-fallback`, {
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
  }, [API_BASE, fileToBase64, setAiActive]);

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
      saveTimerRef.current = setTimeout(() => {
        if (onSave && latestDocRef.current.json) {
          onSave(latestDocRef.current.json, latestDocRef.current.text);
        }
      }, 2000);
    },
  });

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
            onClick={() => handleExport('markdown')}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-white/5 text-amd-white/60 hover:bg-white/10 transition-colors"
          >
            <FileDown size={12} /> Export
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-auto bg-amd-charcoal rounded-b-xl">
        <EditorContent editor={editor} />
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
