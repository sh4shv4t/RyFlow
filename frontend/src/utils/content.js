// Content formatting helpers for safe plain-text previews.

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectTextFromRichNode(node, chunks) {
  if (!node) return;

  if (Array.isArray(node)) {
    node.forEach((item) => collectTextFromRichNode(item, chunks));
    return;
  }

  if (typeof node === 'string') {
    if (node.trim()) chunks.push(node.trim());
    return;
  }

  if (!isObject(node)) return;

  if (typeof node.text === 'string' && node.text.trim()) {
    chunks.push(node.text.trim());
  }

  if (Array.isArray(node.content)) {
    node.content.forEach((child) => collectTextFromRichNode(child, chunks));
  }
}

export function toPlainText(content) {
  if (content === null || content === undefined) return '';

  if (typeof content === 'string') {
    const raw = content.trim();
    if (!raw) return '';

    try {
      const parsed = JSON.parse(raw);
      return toPlainText(parsed);
    } catch {
      return raw.replace(/\s+/g, ' ').trim();
    }
  }

  if (Array.isArray(content)) {
    const pieces = [];
    content.forEach((item) => collectTextFromRichNode(item, pieces));
    return pieces.join(' ').replace(/\s+/g, ' ').trim();
  }

  if (isObject(content)) {
    const pieces = [];
    collectTextFromRichNode(content, pieces);
    if (pieces.length > 0) {
      return pieces.join(' ').replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  return String(content).replace(/\s+/g, ' ').trim();
}

export function formatPreviewText(content, options = {}) {
  const { maxLength = 180, fallback = 'No preview available' } = options;
  const plain = toPlainText(content);
  if (!plain) return fallback;

  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trim()}...`;
}
