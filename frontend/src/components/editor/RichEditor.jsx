// TipTap rich text editor with collaboration and AI toolbar
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
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

export default function RichEditor({ content, onSave, docId }) {
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [aiAction, setAiAction] = useState(null);
  const saveTimerRef = useRef(null);
  const { selectedModel } = useStore();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      Typography,
      Placeholder.configure({
        placeholder: 'Start writing... Use the AI toolbar to enhance your text ✨',
      }),
    ],
    content: content || '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[400px] p-4',
      },
    },
    onUpdate: ({ editor }) => {
      // Auto-save every 30 seconds
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (onSave) onSave(editor.getJSON(), editor.getText());
      }, 30000);
    },
  });

  // Update editor content when prop changes
  useEffect(() => {
    if (editor && content && !editor.isFocused) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Cleanup autosave timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

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
        <div className="relative">
          <ToolbarButton onClick={() => {}} icon={FileDown} tooltip="Export" />
          <div className="absolute top-full left-0 mt-1 hidden group-hover:block">
            <button onClick={() => handleExport('markdown')} className="text-xs">MD</button>
            <button onClick={() => handleExport('text')} className="text-xs">TXT</button>
          </div>
        </div>

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
