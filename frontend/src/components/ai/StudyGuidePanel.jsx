// Study guide generator and quiz player for selected workspace documents.
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { apiFetch } from '../../utils/apiClient';

// Downloads text content as a local markdown file.
function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function defaultGuide() {
  return {
    summary: 'Could not generate a study guide. Try selecting different documents.',
    key_terms: [],
    key_points: [],
    quiz: []
  };
}

function parseStudyGuide(raw) {
  if (!raw || typeof raw !== 'string') {
    return defaultGuide();
  }
  let s = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  const tryParse = (str) => {
    try {
      const p = JSON.parse(str);
      if (p && typeof p === 'object') return p;
    } catch {}
    return null;
  };

  let parsed = tryParse(s);
  if (!parsed) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) parsed = tryParse(m[0]);
  }
  if (!parsed) return defaultGuide();

  return {
    summary: typeof parsed.summary === 'string'
      ? parsed.summary
      : 'Summary not available',
    key_terms: Array.isArray(parsed.key_terms)
      ? parsed.key_terms.filter((t) =>
          t && typeof t.term === 'string')
      : [],
    key_points: Array.isArray(parsed.key_points)
      ? parsed.key_points.filter((p) =>
          typeof p === 'string')
      : [],
    quiz: Array.isArray(parsed.quiz)
      ? parsed.quiz.filter((q) =>
          q && typeof q.question === 'string')
      : []
  };
}

export default function StudyGuidePanel() {
  const { workspace } = useStore();
  const [docs, setDocs] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingGuide, setLoadingGuide] = useState(false);
  const [guideError, setGuideError] = useState('');
  const [guide, setGuide] = useState(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [answers, setAnswers] = useState({});

  // Loads all workspace docs for multi-select picker.
  useEffect(() => {
    if (!workspace?.id) return;
    setLoadingDocs(true);
    axios.get('/api/docs', { params: { workspace_id: workspace.id } })
      .then((res) => setDocs(res.data.documents || []))
      .catch(() => toast.error('Failed to load documents'))
      .finally(() => setLoadingDocs(false));
  }, [workspace?.id]);

  // Generates a study guide from selected document ids.
  const generate = async () => {
    if (!workspace?.id || selectedIds.length === 0) return;
    setLoadingGuide(true);
    setGuideError('Generating...');
    setGuide(null);
    setQuizIndex(0);
    setAnswers({});

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 60000);

    try {
      const res = await apiFetch('/api/ai/study-guide', {
        method: 'POST',
        body: JSON.stringify({
          doc_ids: selectedIds,
          workspace_id: workspace.id
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => null);
      let parsed = null;
      if (data && typeof data === 'object' && (
        'summary' in data || 'key_terms' in data || 'key_points' in data || 'quiz' in data
      )) {
        parsed = parseStudyGuide(JSON.stringify(data));
      } else if (typeof data?.response === 'string') {
        parsed = parseStudyGuide(data.response);
      } else if (typeof data?.guide === 'string') {
        parsed = parseStudyGuide(data.guide);
      } else if (typeof data?.text === 'string') {
        parsed = parseStudyGuide(data.text);
      }

      if (!parsed) {
        parsed = defaultGuide();
      }

      setGuide(parsed);
      setGuideError('');
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        setGuideError('Generation timed out. Try selecting fewer documents, or ensure Ollama has enough time to respond.');
      } else {
        setGuideError(err.message || 'Generation failed');
      }
      toast.error('Failed to generate study guide');
    } finally {
      setLoadingGuide(false);
    }
  };

  // Tracks checked key points in localStorage.
  const [checkedPoints, setCheckedPoints] = useState({});
  useEffect(() => {
    const key = `ryflow_study_points_${workspace?.id || 'default'}`;
    try {
      setCheckedPoints(JSON.parse(localStorage.getItem(key) || '{}'));
    } catch {
      setCheckedPoints({});
    }
  }, [workspace?.id]);

  const togglePoint = (point) => {
    const key = `ryflow_study_points_${workspace?.id || 'default'}`;
    const next = { ...checkedPoints, [point]: !checkedPoints[point] };
    setCheckedPoints(next);
    localStorage.setItem(key, JSON.stringify(next));
  };

  const currentQuiz = guide?.quiz?.[quizIndex];
  const score = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);

  const exportMarkdown = () => {
    if (!guide) return;
    const pickedTitles = docs.filter((d) => selectedIds.includes(d.id)).map((d) => d.title).slice(0, 3).join('_');
    const date = new Date().toISOString().slice(0, 10);
    const body = `# Study Guide\n\n## Summary\n${guide.summary || ''}\n\n## Key Terms\n${(guide.key_terms || []).map((k) => `- **${k.term}**: ${k.definition}`).join('\n')}\n\n## Key Points\n${(guide.key_points || []).map((k) => `- ${k}`).join('\n')}\n\n## Quiz\n${(guide.quiz || []).map((q, i) => `### Q${i + 1}. ${q.question}\n${(q.options || []).map((o, idx) => `- ${String.fromCharCode(65 + idx)}. ${o}`).join('\n')}\n- Correct: ${String.fromCharCode(65 + Number(q.correct || 0))}\n- Explanation: ${q.explanation || ''}`).join('\n\n')}`;
    downloadText(`StudyGuide_${pickedTitles || 'docs'}_${date}.md`, body);
  };

  return (
    <div style={{ height: '100%', borderRadius: '12px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)', padding: '16px', overflow: 'auto' }}>
      <h2 style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>Study Guide</h2>

      <div style={{ borderRadius: '8px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: '12px', marginBottom: '12px' }}>
        <div className="flex items-center justify-between mb-2">
          <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Select Documents</div>
          <div className="flex gap-1">
            <button onClick={() => setSelectedIds(docs.map((d) => d.id))} style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Select All</button>
            <button onClick={() => setSelectedIds([])} style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Deselect All</button>
          </div>
        </div>
        {loadingDocs ? <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Loading documents...</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-40 overflow-auto">
            {docs.map((doc) => (
              <label key={doc.id} style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', padding: '4px', borderRadius: '4px' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(doc.id)}
                  onChange={(e) => {
                    setSelectedIds((prev) => e.target.checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id));
                  }}
                />
                {doc.title}
              </label>
            ))}
          </div>
        )}

        <button
          onClick={generate}
          disabled={loadingGuide || selectedIds.length === 0}
          className={`mt-3 px-3 py-2 rounded text-sm text-[var(--text-on-accent)] ${loadingGuide ? 'bg-accent/70' : 'bg-accent'} disabled:opacity-50`}
        >
          {'Generate Study Guide'}
        </button>

        {guideError ? <div style={{ fontSize: '12px', color: guideError === 'Generating...' ? 'var(--text-tertiary)' : 'var(--status-error)', marginTop: '8px' }}>{guideError}</div> : null}
      </div>

      {guide ? (
        <>
          <section style={{ borderRadius: '8px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: '12px', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>Summary</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{guide.summary}</p>
          </section>

          <section style={{ borderRadius: '8px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: '12px', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>Key Terms</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(guide.key_terms || []).map((item, idx) => (
                <div key={`${item.term}-${idx}`} style={{ borderRadius: '6px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)', padding: '8px' }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{item.term}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{item.definition}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ borderRadius: '8px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: '12px', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>Key Points</h3>
            <div className="space-y-1">
              {(guide.key_points || []).map((point, idx) => (
                <label key={`${point}-${idx}`} style={{ fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={Boolean(checkedPoints[point])} onChange={() => togglePoint(point)} />
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{idx + 1}.</span> {point}
                </label>
              ))}
            </div>
          </section>

          <section style={{ borderRadius: '8px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: '12px', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>Quiz</h3>
            {currentQuiz ? (
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>Question {quizIndex + 1} of {(guide.quiz || []).length}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '8px' }}>{currentQuiz.question}</div>
                <div className="space-y-1">
                  {(currentQuiz.options || []).map((opt, idx) => {
                    const answered = answers[quizIndex] !== undefined;
                    const correctIdx = Number(currentQuiz.correct || 0);
                    const isChosen = answers[quizIndex]?.choice === idx;
                    const isCorrect = idx === correctIdx;
                    let answerStyle = { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' };
                    if (answered && isCorrect) answerStyle = { backgroundColor: 'rgba(61,153,112,0.15)', color: 'var(--success)' };
                    if (answered && isChosen && !isCorrect) answerStyle = { backgroundColor: 'rgba(192,57,43,0.15)', color: 'var(--error)' };
                    return (
                      <button
                        key={`${opt}-${idx}`}
                        disabled={answered}
                        onClick={() => setAnswers((prev) => ({ ...prev, [quizIndex]: { choice: idx, correct: isCorrect } }))}
                        className="w-full text-left px-2 py-1 rounded text-sm"
                        style={answerStyle}
                      >
                        {String.fromCharCode(65 + idx)}. {opt}
                      </button>
                    );
                  })}
                </div>
                {answers[quizIndex] ? <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>{currentQuiz.explanation}</div> : null}
                <button
                  onClick={() => setQuizIndex((i) => Math.min((guide.quiz || []).length, i + 1))}
                  className="mt-3 px-2 py-1 rounded bg-amd-red/20 text-amd-red text-xs"
                >Next Question</button>
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{score}/{(guide.quiz || []).length} - Great effort, keep going.</div>
            )}
          </section>

          <button onClick={exportMarkdown} style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '13px' }}>Download Study Guide</button>
        </>
      ) : null}
    </div>
  );
}
