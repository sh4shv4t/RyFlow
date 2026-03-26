// Study guide generator and quiz player for selected workspace documents.
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';

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

export default function StudyGuidePanel() {
  const { workspace } = useStore();
  const [docs, setDocs] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingGuide, setLoadingGuide] = useState(false);
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
    setGuide(null);
    setQuizIndex(0);
    setAnswers({});
    try {
      const res = await axios.post('/api/ai/study-guide', {
        workspace_id: workspace.id,
        doc_ids: selectedIds
      });
      setGuide(res.data);
    } catch {
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
    <div className="h-full glass-card p-4 overflow-auto space-y-4">
      <h2 className="font-heading text-amd-white">Study Guide</h2>

      <div className="rounded-lg bg-white/5 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-amd-white">Select Documents</div>
          <div className="flex gap-1">
            <button onClick={() => setSelectedIds(docs.map((d) => d.id))} className="px-2 py-1 text-xs rounded bg-white/10 text-amd-white/70">Select All</button>
            <button onClick={() => setSelectedIds([])} className="px-2 py-1 text-xs rounded bg-white/10 text-amd-white/70">Deselect All</button>
          </div>
        </div>
        {loadingDocs ? <div className="text-xs text-amd-white/50">Loading documents...</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-40 overflow-auto">
            {docs.map((doc) => (
              <label key={doc.id} className="text-xs text-amd-white/75 flex items-center gap-2 p-1 rounded hover:bg-white/5">
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
          className={`mt-3 px-3 py-2 rounded text-sm text-white ${loadingGuide ? 'bg-amd-red/50 amd-pulse' : 'bg-amd-red'} disabled:opacity-50`}
        >
          {loadingGuide ? 'Generating...' : 'Generate Study Guide'}
        </button>
      </div>

      {guide ? (
        <>
          <section className="rounded-lg bg-white/5 p-3">
            <h3 className="text-sm text-amd-white mb-2">Summary</h3>
            <p className="text-sm text-amd-white/75">{guide.summary}</p>
          </section>

          <section className="rounded-lg bg-white/5 p-3">
            <h3 className="text-sm text-amd-white mb-2">Key Terms</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(guide.key_terms || []).map((item, idx) => (
                <div key={`${item.term}-${idx}`} className="rounded border border-white/10 p-2">
                  <div className="text-amd-red text-sm font-medium">{item.term}</div>
                  <div className="text-xs text-amd-white/70 mt-1">{item.definition}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg bg-white/5 p-3">
            <h3 className="text-sm text-amd-white mb-2">Key Points</h3>
            <div className="space-y-1">
              {(guide.key_points || []).map((point, idx) => (
                <label key={`${point}-${idx}`} className="text-sm text-amd-white/80 flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(checkedPoints[point])} onChange={() => togglePoint(point)} />
                  {idx + 1}. {point}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-lg bg-white/5 p-3">
            <h3 className="text-sm text-amd-white mb-2">Quiz</h3>
            {currentQuiz ? (
              <div>
                <div className="text-xs text-amd-white/60 mb-2">Question {quizIndex + 1} of {(guide.quiz || []).length}</div>
                <div className="text-sm text-amd-white mb-2">{currentQuiz.question}</div>
                <div className="space-y-1">
                  {(currentQuiz.options || []).map((opt, idx) => {
                    const answered = answers[quizIndex] !== undefined;
                    const correctIdx = Number(currentQuiz.correct || 0);
                    const isChosen = answers[quizIndex]?.choice === idx;
                    const isCorrect = idx === correctIdx;
                    let cls = 'bg-white/10 text-amd-white/75';
                    if (answered && isCorrect) cls = 'bg-green-600/20 text-green-300';
                    if (answered && isChosen && !isCorrect) cls = 'bg-red-600/20 text-red-300';
                    return (
                      <button
                        key={`${opt}-${idx}`}
                        disabled={answered}
                        onClick={() => setAnswers((prev) => ({ ...prev, [quizIndex]: { choice: idx, correct: isCorrect } }))}
                        className={`w-full text-left px-2 py-1 rounded text-sm ${cls}`}
                      >
                        {String.fromCharCode(65 + idx)}. {opt}
                      </button>
                    );
                  })}
                </div>
                {answers[quizIndex] ? <div className="text-xs text-amd-white/70 mt-2">{currentQuiz.explanation}</div> : null}
                <button
                  onClick={() => setQuizIndex((i) => Math.min((guide.quiz || []).length, i + 1))}
                  className="mt-3 px-2 py-1 rounded bg-amd-red/20 text-amd-red text-xs"
                >Next Question</button>
              </div>
            ) : (
              <div className="text-sm text-amd-white/75">{score}/{(guide.quiz || []).length} - Great effort, keep going.</div>
            )}
          </section>

          <button onClick={exportMarkdown} className="px-3 py-2 rounded bg-white/10 text-amd-white/75 text-sm">Download Study Guide</button>
        </>
      ) : null}
    </div>
  );
}
