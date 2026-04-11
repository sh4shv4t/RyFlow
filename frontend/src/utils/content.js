/**
 * Extracts plain text preview from any content field.
 * Handles TipTap JSON, plain strings, and objects.
 */
export function extractTextPreview(
  content,
  maxLen = 100
) {
  if (!content) return '';

  // Already a plain short string
  if (
    typeof content === 'string' &&
    !content.trim().startsWith('{') &&
    !content.trim().startsWith('[')
  ) {
    const trimmed = content.trim();
    return trimmed.length > maxLen
      ? trimmed.slice(0, maxLen) + '…'
      : trimmed;
  }

  // Try to parse as JSON
  let parsed = content;
  if (typeof content === 'string') {
    try {
      parsed = JSON.parse(content);
    } catch {
      // Not valid JSON — treat as plain text
      const trimmed = content.trim();
      return trimmed.length > maxLen
        ? trimmed.slice(0, maxLen) + '…'
        : trimmed;
    }
  }

  // TipTap ProseMirror JSON format
  if (
    parsed &&
    typeof parsed === 'object' &&
    parsed.type === 'doc'
  ) {
    return extractFromProseMirror(parsed, maxLen);
  }

  // Array of chat messages
  if (Array.isArray(parsed)) {
    // Find last user or assistant message
    const last = [...parsed]
      .reverse()
      .find(m => m?.role && m?.content);
    if (last) {
      const text = String(last.content || '').trim();
      return text.length > maxLen
        ? text.slice(0, maxLen) + '…'
        : text;
    }
    return '';
  }

  // Single message object
  if (parsed?.content && typeof parsed.content === 'string') {
    const text = parsed.content.trim();
    return text.length > maxLen
      ? text.slice(0, maxLen) + '…'
      : text;
  }

  // Fallback — do not show raw JSON
  return '';
}

/**
 * Walks a ProseMirror/TipTap doc node tree
 * and collects all text nodes.
 */
function extractFromProseMirror(node, maxLen) {
  const parts = [];
  let total = 0;

  function walk(n) {
    if (!n || total >= maxLen) return;

    if (n.type === 'text' && n.text) {
      parts.push(n.text);
      total += n.text.length;
      return;
    }

    // Add spacing between block elements
    const blockTypes = new Set([
      'paragraph', 'heading', 'listItem',
      'blockquote', 'codeBlock'
    ]);
    if (
      blockTypes.has(n.type) &&
      parts.length > 0 &&
      parts[parts.length - 1] !== ' '
    ) {
      parts.push(' ');
    }

    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        if (total >= maxLen) break;
        walk(child);
      }
    }
  }

  walk(node);
  const full = parts.join('').trim();
  return full.length > maxLen
    ? full.slice(0, maxLen) + '…'
    : full;
}

/**
 * Safe display of any value — never shows
 * raw JSON objects or arrays to the user.
 */
export function safeDisplay(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    // Check if it looks like JSON
    const t = value.trim();
    if (
      (t.startsWith('{') && t.endsWith('}')) ||
      (t.startsWith('[') && t.endsWith(']'))
    ) {
      return extractTextPreview(value);
    }
    return value;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  // Objects and arrays — extract text or return empty
  return extractTextPreview(value);
}

/**
 * Gets a clean title from any item.
 * Falls back gracefully if title is missing.
 */
export function getItemTitle(item) {
  if (!item) return 'Untitled';
  if (item.title && typeof item.title === 'string') {
    return item.title.trim() || 'Untitled';
  }
  if (item.name && typeof item.name === 'string') {
    return item.name.trim() || 'Untitled';
  }
  return 'Untitled';
}

/**
 * Returns a short content summary suitable
 * for list views and graph tooltips.
 */
export function getContentSummary(item, maxLen = 80) {
  if (!item) return '';

  // Prefer explicit content_summary field
  if (
    item.content_summary &&
    typeof item.content_summary === 'string' &&
    !item.content_summary.trim().startsWith('{')
  ) {
    const s = item.content_summary.trim();
    return s.length > maxLen
      ? s.slice(0, maxLen) + '…'
      : s;
  }

  // Fall back to extracting from content
  if (item.content) {
    return extractTextPreview(item.content, maxLen);
  }

  // Fall back to description
  if (
    item.description &&
    typeof item.description === 'string'
  ) {
    const d = item.description.trim();
    return d.length > maxLen
      ? d.slice(0, maxLen) + '…'
      : d;
  }

  return '';
}
