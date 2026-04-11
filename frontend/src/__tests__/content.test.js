import { describe, it, expect } from 'vitest';
import { extractTextPreview, getContentSummary } from '../utils/content';

describe('content extraction', () => {
  it('extracts readable text from truncated TipTap JSON-like strings', () => {
    const raw = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Abstract:"},{"type":"text","text":" The Bitcoin cryptocurrency records its transactions in a public log called the blockchain. Its security rests critically on the distributed…';

    const preview = extractTextPreview(raw, 180);

    expect(preview).toContain('Abstract:');
    expect(preview).toContain('The Bitcoin cryptocurrency records its transactions');
    expect(preview.startsWith('{')).toBe(false);
  });

  it('uses extraction for JSON-like content_summary values', () => {
    const item = {
      content_summary: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Consensus in distributed systems"}]}'
    };

    const summary = getContentSummary(item, 80);

    expect(summary).toContain('Consensus in distributed systems');
    expect(summary.startsWith('{')).toBe(false);
  });
});
