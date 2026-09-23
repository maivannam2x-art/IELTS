'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { exportCsv, loadWords, saveWords } from '@/lib/local-store';
import type { EnrichmentResult, PartOfSpeech, VocabEntry } from '@/lib/types';

type View = 'today' | 'vocabulary' | 'flashcards' | 'practice' | 'phrasal' | 'add';
type PracticeMode = 'VI_EN' | 'EN_VI' | 'MCQ' | 'FILL' | 'SENTENCE';
type ReviewResult = 'again' | 'hard' | 'good' | 'easy';

type Feedback = { text: string; good?: boolean; answered?: boolean };

const views: { key: View; label: string; short: string }[] = [
  { key: 'today', label: '🏠 Hôm nay', short: 'Hôm nay' },
  { key: 'vocabulary', label: '📖 Từ vựng', short: 'Kho từ' },
  { key: 'phrasal', label: '🧩 Phrasal verbs', short: 'Phrasal' },
  { key: 'flashcards', label: '🃏 Flashcards', short: 'Thẻ' },
  { key: 'practice', label: '✏️ Luyện tập', short: 'Luyện' },
  { key: 'add', label: '➕ Thêm từ', short: 'Thêm' },
];

const posValues: PartOfSpeech[] = ['NOUN', 'VERB', 'ADJECTIVE', 'ADVERB', 'PHRASAL_VERB', 'COLLOCATION', 'IDIOM', 'OTHER'];
const normalize = (value: string) => value.trim().toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ');
const plusDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const formatDate = (iso: string) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(iso));

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function VocabApp() {
  const [view, setView] = useState<View>('today');
  const [words, setWords] = useState<VocabEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [topicFilter, setTopicFilter] = useState('ALL');
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('VI_EN');
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<Feedback>({ text: '' });
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const [toast, setToast] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setWords(loadWords());
    setReady(true);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  useEffect(() => {
    if (ready) saveWords(words);
  }, [words, ready]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const now = Date.now();
  const dueWords = useMemo(() => words.filter((word) => new Date(word.nextReviewAt).getTime() <= now), [words, now]);
  const mastered = words.filter((word) => word.correctCount >= 5 && word.correctCount > word.wrongCount * 2).length;
  const weak = words.filter((word) => word.wrongCount > word.correctCount).length;
  const newToday = words.filter((word) => sameDay(new Date(word.createdAt), new Date())).length;
  const topics = useMemo(() => Array.from(new Set(words.map((word) => word.topic).filter(Boolean))).sort(), [words]);
  const filtered = useMemo(() => words.filter((word) => {
    const q = normalize(query);
    const matchQ = !q || normalize(`${word.headword} ${word.meaningVi} ${word.topic} ${word.definitionEn || ''}`).includes(q);
    const matchPos = posFilter === 'ALL' || word.partOfSpeech === posFilter;
    const matchTopic = topicFilter === 'ALL' || word.topic === topicFilter;
    return matchQ && matchPos && matchTopic;
  }), [words, query, posFilter, topicFilter]);
  const phrasal = words.filter((word) => word.partOfSpeech === 'PHRASAL_VERB' || word.entryType === 'PHRASAL_VERB');

  const reviewPool = dueWords.length ? dueWords : words;
  const currentCard = reviewPool.length ? reviewPool[cardIndex % reviewPool.length] : null;
  const practicePool = dueWords.length ? dueWords : words;
  const currentPractice = practicePool.length ? practicePool[practiceIndex % practicePool.length] : null;

  const mcqOptions = useMemo(() => {
    if (!currentPractice) return [];
    const otherMeanings = Array.from(new Set(words.filter((word) => word.id !== currentPractice.id).map((word) => word.meaningVi))).slice(0);
    return shuffle([currentPractice.meaningVi, ...shuffle(otherMeanings).slice(0, 3)]);
  }, [currentPractice?.id, words]);

  function resetPracticeState() {
    setAnswer('');
    setFeedback({ text: '' });
  }

  function markReview(id: string, result: ReviewResult) {
    const intervals: Record<ReviewResult, (current: number) => number> = {
      again: () => 1,
      hard: (current) => Math.max(2, current),
      good: (current) => Math.max(3, Math.round(current * 1.8)),
      easy: (current) => Math.max(7, Math.round(current * 2.7)),
    };
    setWords((previous) => previous.map((word) => {
      if (word.id !== id) return word;
      const intervalDays = intervals[result](word.intervalDays);
      const success = result !== 'again';
      return {
        ...word,
        intervalDays,
        nextReviewAt: plusDays(intervalDays),
        correctCount: word.correctCount + (success ? 1 : 0),
        wrongCount: word.wrongCount + (success ? 0 : 1),
      };
    }));
    setSessionCorrect((value) => value + (result === 'again' ? 0 : 1));
    setSessionWrong((value) => value + (result === 'again' ? 1 : 0));
    setRevealed(false);
    setCardIndex((index) => reviewPool.length ? (index + 1) % reviewPool.length : 0);
  }

  function deleteWord(id: string) {
    const word = words.find((item) => item.id === id);
    if (!word) return;
    if (!window.confirm(`Xóa “${word.headword}” khỏi kho từ?`)) return;
    setWords((previous) => previous.filter((item) => item.id !== id));
    setToast('Đã xóa từ khỏi kho.');
  }

  function nextPractice() {
    resetPracticeState();
    setPracticeIndex((index) => practicePool.length ? (index + 1) % practicePool.length : 0);
  }

  function submitPractice(candidate = answer) {
    if (!currentPractice || feedback.answered) return;
    const normalizedCandidate = normalize(candidate);
    if (!normalizedCandidate) return;
    let expected = '';
    let ok = false;

    if (practiceMode === 'VI_EN' || practiceMode === 'FILL') {
      expected = currentPractice.headword;
      ok = normalizedCandidate === normalize(expected);
    } else if (practiceMode === 'SENTENCE') {
      expected = `Một câu hoàn chỉnh có dùng “${currentPractice.headword}”`;
      ok = normalizedCandidate.includes(normalize(currentPractice.headword)) && candidate.trim().split(/\s+/).length >= 5;
    } else {
      expected = currentPractice.meaningVi;
      const acceptable = currentPractice.meaningVi.split(/[;,/]/).map(normalize).filter(Boolean);
      ok = acceptable.some((value) => normalizedCandidate.includes(value) || value.includes(normalizedCandidate));
    }

    setFeedback({
      text: ok ? `✓ Chính xác — ${currentPractice.headword}: ${currentPractice.meaningVi}` : `✗ Đáp án: ${expected}`,
      good: ok,
      answered: true,
    });
    setSessionCorrect((value) => value + (ok ? 1 : 0));
    setSessionWrong((value) => value + (ok ? 0 : 1));
    setWords((previous) => previous.map((word) => word.id === currentPractice.id ? {
      ...word,
      correctCount: word.correctCount + (ok ? 1 : 0),
      wrongCount: word.wrongCount + (ok ? 0 : 1),
      nextReviewAt: ok ? plusDays(Math.max(2, word.intervalDays)) : plusDays(1),
      intervalDays: ok ? Math.max(2, Math.round(word.intervalDays * 1.5)) : 1,
    } : word));
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), words }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ielts-vocab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = Array.isArray(parsed) ? parsed : parsed.words;
      if (!Array.isArray(imported)) throw new Error('invalid');
      const clean = imported.filter((item) => item && typeof item.headword === 'string' && typeof item.meaningVi === 'string');
      if (!clean.length) throw new Error('empty');
      const merged = [...clean, ...words].filter((word, index, array) => index === array.findIndex((candidate) => normalize(candidate.headword) === normalize(word.headword) && candidate.partOfSpeech === word.partOfSpeech));
      setWords(merged);
      setToast(`Đã nhập ${clean.length} mục, kho hiện có ${merged.length} từ.`);
    } catch {
      setToast('File backup không hợp lệ.');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">IV</span><div>IELTS VOCAB<small>Personal trainer</small></div></div>
      <nav className="nav">{views.map((item) => <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}>{item.label}{item.key === 'flashcards' && dueWords.length > 0 ? <span className="nav-count">{dueWords.length}</span> : null}</button>)}</nav>
      <div className="sidebar-footer"><div className="mini-label">Phiên hiện tại</div><strong>{sessionCorrect + sessionWrong} câu</strong><span>{sessionCorrect} đúng · {sessionWrong} sai</span></div>
    </aside>

    <div className="mobile-nav">{views.map((item) => <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}>{item.short}</button>)}</div>

    <main className="main"><div className="container">
      {view === 'today' && <TodayView total={words.length} due={dueWords.length} mastered={mastered} weak={weak} newToday={newToday} sessionCorrect={sessionCorrect} sessionWrong={sessionWrong} onReview={() => { setView('flashcards'); setCardIndex(0); setRevealed(false); }} onPractice={() => { setView('practice'); setPracticeIndex(0); resetPracticeState(); }} onAdd={() => setView('add')} />}
      {view === 'vocabulary' && <VocabularyView words={filtered} total={words.length} query={query} setQuery={setQuery} posFilter={posFilter} setPosFilter={setPosFilter} topicFilter={topicFilter} setTopicFilter={setTopicFilter} topics={topics} deleteWord={deleteWord} onExport={() => exportCsv(words)} onBackup={exportBackup} importRef={importRef} onImport={importBackup} onAdd={() => setView('add')} />}
      {view === 'phrasal' && <PhrasalView words={phrasal} onAdd={() => setView('add')} />}
      {view === 'flashcards' && <FlashcardView word={currentCard} index={cardIndex} total={reviewPool.length} dueMode={dueWords.length > 0} revealed={revealed} setRevealed={setRevealed} next={() => { setCardIndex((index) => reviewPool.length ? (index + 1) % reviewPool.length : 0); setRevealed(false); }} markReview={markReview} />}
      {view === 'practice' && <PracticeView current={currentPractice} poolSize={practicePool.length} index={practiceIndex} mode={practiceMode} setMode={(mode) => { setPracticeMode(mode); resetPracticeState(); }} answer={answer} setAnswer={setAnswer} submit={submitPractice} next={nextPractice} feedback={feedback} options={mcqOptions} sessionCorrect={sessionCorrect} sessionWrong={sessionWrong} />}
      {view === 'add' && <AddWordView onAdd={(word) => { setWords((previous) => [word, ...previous]); setToast(`Đã thêm “${word.headword}”.`); setView('vocabulary'); }} existing={words} />}
    </div></main>
    {toast ? <div className="toast">{toast}</div> : null}
  </div>;
}

function Header({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="topbar"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function TodayView({ total, due, mastered, weak, newToday, sessionCorrect, sessionWrong, onReview, onPractice, onAdd }: { total: number; due: number; mastered: number; weak: number; newToday: number; sessionCorrect: number; sessionWrong: number; onReview: () => void; onPractice: () => void; onAdd: () => void }) {
  const progress = total ? Math.round(mastered / total * 100) : 0;
  const attempts = sessionCorrect + sessionWrong;
  const accuracy = attempts ? Math.round(sessionCorrect / attempts * 100) : 0;
  return <>
    <Header title="Hôm nay" subtitle="Một phiên học ngắn, đúng từ cần ôn và có thể đo được tiến bộ." action={<span className="badge">Daily IELTS</span>} />
    <section className="hero-card">
      <div><span className="eyebrow">Daily focus</span><h2>{due ? `Bạn có ${due} từ cần ôn hôm nay` : 'Không có từ quá hạn — luyện thêm để giữ nhịp'}</h2><p>{due ? 'Ưu tiên hoàn thành lượt ôn trước, sau đó chuyển sang bài kiểm tra chủ động.' : 'Bạn có thể luyện kho hiện tại hoặc thêm từ mới từ bài Reading/Listening hôm nay.'}</p><div className="actions"><button className="btn primary" onClick={onReview}>{due ? 'Ôn từ đến hạn' : 'Ôn lại kho từ'} →</button><button className="btn" onClick={onPractice}>Luyện kiểm tra</button><button className="btn ghost" onClick={onAdd}>+ Thêm từ</button></div></div>
      <div className="hero-score"><span>Tiến độ kho từ</span><strong>{progress}%</strong><div className="progress"><span style={{ width: `${progress}%` }} /></div></div>
    </section>
    <div className="grid grid-4 stats-grid">
      <StatCard label="Tổng từ" value={total} note={`+${newToday} hôm nay`} />
      <StatCard label="Cần ôn" value={due} note="Theo lịch SRS" accent />
      <StatCard label="Đã vững" value={mastered} note={`${progress}% kho từ`} />
      <StatCard label="Từ yếu" value={weak} note="Nên luyện chủ động" />
    </div>
    <div className="grid grid-2 section-gap">
      <section className="card"><div className="card-heading"><div><div className="kicker">Phiên học</div><h2 className="section-title">Độ chính xác hiện tại</h2></div><strong className="big-number">{accuracy}%</strong></div><div className="progress"><span style={{ width: `${accuracy}%` }} /></div><div className="session-summary"><span><b>{sessionCorrect}</b> trả lời đúng</span><span><b>{sessionWrong}</b> cần xem lại</span></div></section>
      <section className="card"><div className="kicker">Cách học đề xuất</div><h2 className="section-title">Review → Recall → Context</h2><ol className="study-steps"><li><b>Flashcard:</b> kiểm tra trí nhớ theo lịch.</li><li><b>Practice:</b> tự gõ câu trả lời, không chỉ nhận diện.</li><li><b>Example:</b> đọc và dùng lại từ trong ngữ cảnh IELTS.</li></ol></section>
    </div>
  </>;
}

function StatCard({ label, value, note, accent }: { label: string; value: number; note: string; accent?: boolean }) {
  return <div className={`card stat-card ${accent ? 'accent' : ''}`}><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>;
}

function VocabularyView({ words, total, query, setQuery, posFilter, setPosFilter, topicFilter, setTopicFilter, topics, deleteWord, onExport, onBackup, importRef, onImport, onAdd }: { words: VocabEntry[]; total: number; query: string; setQuery: (value: string) => void; posFilter: string; setPosFilter: (value: string) => void; topicFilter: string; setTopicFilter: (value: string) => void; topics: string[]; deleteWord: (id: string) => void; onExport: () => void; onBackup: () => void; importRef: React.RefObject<HTMLInputElement | null>; onImport: (file?: File) => void; onAdd: () => void }) {
  return <>
    <Header title="Kho từ vựng" subtitle={`${words.length}/${total} mục đang hiển thị. Tìm nhanh theo từ, nghĩa, topic hoặc định nghĩa.`} action={<button className="btn primary" onClick={onAdd}>+ Thêm từ</button>} />
    <div className="card toolbar-card">
      <div className="search-row"><input className="input search-input" placeholder="Tìm từ, nghĩa, topic..." value={query} onChange={(event) => setQuery(event.target.value)} /><select className="select" value={posFilter} onChange={(event) => setPosFilter(event.target.value)}><option value="ALL">Tất cả POS</option>{posValues.map((pos) => <option key={pos}>{pos}</option>)}</select><select className="select" value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}><option value="ALL">Tất cả topic</option>{topics.map((topic) => <option key={topic}>{topic}</option>)}</select></div>
      <div className="actions compact-actions"><button className="btn" onClick={onExport}>Xuất CSV</button><button className="btn" onClick={onBackup}>Backup JSON</button><button className="btn" onClick={() => importRef.current?.click()}>Nhập backup</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => onImport(event.target.files?.[0])} /></div>
    </div>
    {words.length ? <div className="word-list">{words.map((word) => <article className="word-card" key={word.id}><div className="word-card-main"><div className="word-title-row"><div><div className="word-title">{word.headword}<button className="speak-btn" aria-label={`Phát âm ${word.headword}`} onClick={() => speak(word.headword)}>🔊</button></div><div className="word-meta"><span>{word.ipa || 'Chưa có IPA'}</span><span className="pos">{word.partOfSpeech}</span><span className="topic-chip">{word.topic}</span></div></div><div className="review-date">Ôn: {formatDate(word.nextReviewAt)}</div></div><div className="word-meaning">{word.meaningVi}</div>{word.definitionEn ? <p className="muted word-definition">{word.definitionEn}</p> : null}{word.exampleEn ? <div className="example-box"><span>Example</span>{word.exampleEn}</div> : null}</div><div className="word-card-side"><div className="accuracy-mini"><span>Đúng</span><b>{word.correctCount}</b><span>Sai</span><b>{word.wrongCount}</b></div><button className="btn danger small" onClick={() => deleteWord(word.id)}>Xóa</button></div></article>)}</div> : <div className="card empty-state"><div className="empty-icon">⌕</div><h3>Không tìm thấy từ phù hợp</h3><p>Thử bỏ bớt bộ lọc hoặc thêm một từ mới.</p></div>}
  </>;
}

function PhrasalView({ words, onAdd }: { words: VocabEntry[]; onAdd: () => void }) {
  return <><Header title="Phrasal verbs" subtitle="Tách riêng cụm động từ để học nghĩa, cấu trúc và ví dụ theo ngữ cảnh." action={<button className="btn primary" onClick={onAdd}>+ Thêm phrasal verb</button>} />
    <div className="grid grid-2">{words.map((word) => <article className="card phrasal-card" key={word.id}><div className="card-heading"><span className="pos">PHRASAL VERB</span><button className="speak-btn" onClick={() => speak(word.headword)}>🔊</button></div><h2>{word.headword}</h2><strong>{word.meaningVi}</strong>{word.definitionEn ? <p className="muted">{word.definitionEn}</p> : null}<hr className="hr" />{word.exampleEn ? <div className="example-box"><span>Example</span>{word.exampleEn}</div> : null}{word.synonyms?.length ? <p className="muted"><b>Gần nghĩa:</b> {word.synonyms.join(', ')}</p> : null}</article>)}{!words.length && <div className="card empty-state"><div className="empty-icon">🧩</div><h3>Chưa có phrasal verb</h3><p>Thêm các cụm gặp trong Listening/Reading để luyện riêng.</p></div>}</div>
  </>;
}

function FlashcardView({ word, index, total, dueMode, revealed, setRevealed, next, markReview }: { word: VocabEntry | null; index: number; total: number; dueMode: boolean; revealed: boolean; setRevealed: (value: boolean) => void; next: () => void; markReview: (id: string, result: ReviewResult) => void }) {
  return <><Header title="Flashcards" subtitle={dueMode ? 'Đang ưu tiên những từ đến hạn hôm nay.' : 'Không có từ quá hạn — đang ôn lại toàn bộ kho.'} action={<span className="badge">{total ? index % total + 1 : 0} / {total}</span>} />
    {!word ? <div className="card empty-state"><div className="empty-icon">🃏</div><h3>Chưa có từ để ôn</h3><p>Thêm từ mới để bắt đầu phiên flashcard.</p></div> : <div className={`card flashcard ${revealed ? 'revealed' : ''}`}><div className="flashcard-inner"><div className="flash-top"><span className="pos">{word.partOfSpeech}</span><span className="topic-chip">{word.topic}</span></div><button className="speak-large" onClick={() => speak(word.headword)}>🔊</button><div className="flash-word">{word.headword}</div><div className="muted">{word.ipa}</div>{!revealed ? <><p className="flash-hint">Tự nhớ nghĩa trước khi lật thẻ.</p><button className="btn primary large" onClick={() => setRevealed(true)}>Hiện đáp án</button></> : <><div className="flash-meaning">{word.meaningVi}</div>{word.definitionEn ? <p>{word.definitionEn}</p> : null}{word.exampleEn ? <div className="callout">{word.exampleEn}</div> : null}<div className="review-actions"><ReviewButton label="Again" sub="1 ngày" kind="danger" onClick={() => markReview(word.id, 'again')} /><ReviewButton label="Hard" sub={`${Math.max(2, word.intervalDays)} ngày`} onClick={() => markReview(word.id, 'hard')} /><ReviewButton label="Good" sub={`${Math.max(3, Math.round(word.intervalDays * 1.8))} ngày`} kind="success" onClick={() => markReview(word.id, 'good')} /><ReviewButton label="Easy" sub={`${Math.max(7, Math.round(word.intervalDays * 2.7))} ngày`} kind="primary" onClick={() => markReview(word.id, 'easy')} /></div></>}<button className="btn ghost skip-btn" onClick={next}>Bỏ qua →</button></div></div>}
  </>;
}

function ReviewButton({ label, sub, kind, onClick }: { label: string; sub: string; kind?: string; onClick: () => void }) {
  return <button className={`btn review-btn ${kind || ''}`} onClick={onClick}><b>{label}</b><span>{sub}</span></button>;
}

function PracticeView({ current, poolSize, index, mode, setMode, answer, setAnswer, submit, next, feedback, options, sessionCorrect, sessionWrong }: { current: VocabEntry | null; poolSize: number; index: number; mode: PracticeMode; setMode: (mode: PracticeMode) => void; answer: string; setAnswer: (value: string) => void; submit: (candidate?: string) => void; next: () => void; feedback: Feedback; options: string[]; sessionCorrect: number; sessionWrong: number }) {
  const fillSentence = current?.exampleEn ? current.exampleEn.replace(new RegExp(current.headword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '_____') : '';
  const modes: { key: PracticeMode; label: string }[] = [{ key: 'VI_EN', label: 'Việt → Anh' }, { key: 'EN_VI', label: 'Anh → Việt' }, { key: 'MCQ', label: 'Trắc nghiệm' }, { key: 'FILL', label: 'Điền câu' }, { key: 'SENTENCE', label: 'Viết câu' }];
  return <><Header title="Luyện tập" subtitle="Ưu tiên active recall: tự tạo câu trả lời trước khi xem đáp án." action={<span className="badge">{poolSize ? index % poolSize + 1 : 0}/{poolSize}</span>} />
    <div className="practice-layout"><aside className="practice-sidebar"><div className="card"><div className="kicker">Chế độ</div><div className="mode-list">{modes.map((item) => <button key={item.key} className={mode === item.key ? 'active' : ''} onClick={() => setMode(item.key)}>{item.label}</button>)}</div></div><div className="card session-card"><div className="kicker">Phiên học</div><div><strong>{sessionCorrect}</strong><span>Đúng</span></div><div><strong>{sessionWrong}</strong><span>Sai</span></div></div></aside>
      <section className="card practice-card">{!current ? <div className="empty-state"><div className="empty-icon">✏️</div><h3>Chưa có từ để kiểm tra</h3></div> : <><div className="practice-meta"><span className="pos">{current.partOfSpeech}</span><span className="topic-chip">{current.topic}</span></div><div className="practice-prompt">{mode === 'VI_EN' ? current.meaningVi : mode === 'FILL' ? (fillSentence || `Điền từ có nghĩa: ${current.meaningVi}`) : mode === 'SENTENCE' ? `Viết một câu tiếng Anh có sử dụng “${current.headword}”` : current.headword}</div>{mode !== 'VI_EN' && mode !== 'FILL' && mode !== 'SENTENCE' ? <button className="speak-btn practice-speak" onClick={() => speak(current.headword)}>🔊 Nghe phát âm</button> : null}{mode === 'MCQ' ? <div className="option-list">{options.map((option) => <button disabled={feedback.answered} key={option} className="btn option-btn" onClick={() => submit(option)}>{option}</button>)}</div> : <form onSubmit={(event) => { event.preventDefault(); submit(); }}><input autoFocus className="input answer-input" autoComplete="off" disabled={feedback.answered} placeholder={mode === 'VI_EN' || mode === 'FILL' ? 'Nhập từ tiếng Anh...' : mode === 'SENTENCE' ? 'Viết câu của bạn...' : 'Nhập nghĩa tiếng Việt...'} value={answer} onChange={(event) => setAnswer(event.target.value)} /><div className="actions"><button className="btn primary" type="submit" disabled={!answer.trim() || feedback.answered}>Kiểm tra</button><button className="btn" type="button" onClick={next}>Câu tiếp →</button></div></form>}<div className={`feedback ${feedback.good === true ? 'good' : feedback.good === false ? 'bad' : ''}`}>{feedback.text}</div>{feedback.answered && current.exampleEn ? <div className="example-box practice-example"><span>Context</span>{current.exampleEn}</div> : null}</>}</section></div>
  </>;
}

function AddWordView({ onAdd, existing }: { onAdd: (word: VocabEntry) => void; existing: VocabEntry[] }) {
  const [headword, setHeadword] = useState('');
  const [meaning, setMeaning] = useState('');
  const [pos, setPos] = useState<PartOfSpeech>('NOUN');
  const [ipa, setIpa] = useState('');
  const [definition, setDefinition] = useState('');
  const [example, setExample] = useState('');
  const [exampleVi, setExampleVi] = useState('');
  const [topic, setTopic] = useState('General');
  const [level, setLevel] = useState('');
  const [entryType, setEntryType] = useState<VocabEntry['entryType']>('WORD');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [wordFamily, setWordFamily] = useState<string[]>([]);
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function enrich() {
    if (!headword.trim()) { setMessage('Nhập từ trước khi tra.'); return; }
    setLoading(true);
    setMessage('Đang lấy dữ liệu dictionary và AI...');
    try {
      const response = await fetch('/api/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word: headword }) });
      const data = await response.json() as EnrichmentResult & { aiConfigured?: boolean; aiError?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || 'Lookup failed');
      setIpa(data.ipa || '');
      if (data.partOfSpeech) {
        setPos(data.partOfSpeech);
        if (data.partOfSpeech === 'PHRASAL_VERB') setEntryType('PHRASAL_VERB');
        if (data.partOfSpeech === 'COLLOCATION') setEntryType('COLLOCATION');
        if (data.partOfSpeech === 'IDIOM') setEntryType('IDIOM');
      }
      setDefinition(data.definitionEn || '');
      setSuggestions(data.meaningsVi || []);
      if (!meaning && data.meaningsVi?.[0]) setMeaning(data.meaningsVi[0]);
      setWordFamily(data.wordFamily || []);
      setSynonyms(data.synonyms || []);
      if (data.examples?.[0]) { setExample(data.examples[0].en || ''); setExampleVi(data.examples[0].vi || ''); }
      if (data.topicSuggestions?.[0]) setTopic(data.topicSuggestions[0]);
      setMessage(data.aiConfigured ? (data.aiError ? 'Dictionary đã trả kết quả; AI đang lỗi hoặc hết quota.' : 'Đã điền gợi ý từ dictionary + AI. Hãy kiểm tra trước khi lưu.') : 'Đã lấy dictionary. Thêm GEMINI_API_KEY để tự gợi ý nghĩa tiếng Việt.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tra từ.');
    } finally {
      setLoading(false);
    }
  }

  function save() {
    if (!headword.trim() || !meaning.trim()) { setMessage('Từ và nghĩa tiếng Việt là bắt buộc.'); return; }
    if (existing.some((word) => normalize(word.headword) === normalize(headword) && word.partOfSpeech === pos)) { setMessage('Từ này với cùng loại từ đã tồn tại.'); return; }
    onAdd({ id: uid(), headword: headword.trim(), ipa: ipa.trim(), partOfSpeech: pos, meaningVi: meaning.trim(), definitionEn: definition.trim(), exampleEn: example.trim(), exampleVi: exampleVi.trim(), topic: topic.trim() || 'General', level: level.trim(), entryType, wordFamily, synonyms, createdAt: new Date().toISOString(), intervalDays: 1, nextReviewAt: new Date().toISOString(), correctCount: 0, wrongCount: 0 });
  }

  return <><Header title="Thêm từ mới" subtitle="Tra nhanh, kiểm tra gợi ý và lưu một entry đầy đủ để học lâu dài." action={headword ? <button className="btn" onClick={() => speak(headword)}>🔊 Phát âm</button> : undefined} />
    <div className="add-layout"><section className="card add-main"><div className="form-grid"><div className="field full"><label>Từ / cụm từ *</label><div className="lookup-row"><input className="input large-input" value={headword} onChange={(event) => setHeadword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); enrich(); } }} placeholder="Ví dụ: deteriorate / carry out" /><button className="btn primary" disabled={loading} onClick={enrich}>{loading ? 'Đang tra...' : 'Tra & gợi ý'}</button></div></div><div className="field"><label>Part of speech *</label><select className="select" value={pos} onChange={(event) => setPos(event.target.value as PartOfSpeech)}>{posValues.map((value) => <option key={value}>{value}</option>)}</select></div><div className="field"><label>Loại entry</label><select className="select" value={entryType} onChange={(event) => setEntryType(event.target.value as VocabEntry['entryType'])}><option>WORD</option><option>PHRASAL_VERB</option><option>COLLOCATION</option><option>IDIOM</option></select></div><div className="field"><label>IPA</label><input className="input" value={ipa} onChange={(event) => setIpa(event.target.value)} placeholder="/ˈ.../" /></div><div className="field"><label>CEFR</label><input className="input" value={level} onChange={(event) => setLevel(event.target.value)} placeholder="B2 / C1" /></div><div className="field full"><label>Nghĩa tiếng Việt *</label><input className="input" value={meaning} onChange={(event) => setMeaning(event.target.value)} placeholder="Nghĩa bạn muốn ghi nhớ" />{suggestions.length ? <div className="suggestion-list">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setMeaning(suggestion)}>{suggestion}</button>)}</div> : null}</div><div className="field full"><label>English definition</label><textarea className="textarea" value={definition} onChange={(event) => setDefinition(event.target.value)} /></div><div className="field full"><label>Example sentence</label><textarea className="textarea" value={example} onChange={(event) => setExample(event.target.value)} /></div><div className="field full"><label>Dịch câu ví dụ</label><textarea className="textarea" value={exampleVi} onChange={(event) => setExampleVi(event.target.value)} /></div><div className="field"><label>IELTS topic</label><input className="input" value={topic} onChange={(event) => setTopic(event.target.value)} /></div><div className="field"><label>Word family</label><input className="input" value={wordFamily.join(', ')} onChange={(event) => setWordFamily(event.target.value.split(',').map((value) => value.trim()).filter(Boolean))} /></div><div className="field full"><label>Synonyms</label><input className="input" value={synonyms.join(', ')} onChange={(event) => setSynonyms(event.target.value.split(',').map((value) => value.trim()).filter(Boolean))} /></div></div><div className={`feedback ${message.includes('tồn tại') || message.includes('bắt buộc') || message.includes('Không') ? 'bad' : ''}`}>{message}</div><div className="form-footer"><button className="btn primary large" onClick={save}>Lưu vào kho từ</button><span className="muted">Từ mới sẽ được đưa vào lịch ôn ngay hôm nay.</span></div></section><aside className="card add-tips"><div className="kicker">Gợi ý nhập từ</div><h3>Một entry tốt nên có gì?</h3><ul><li>Nghĩa tiếng Việt ngắn, đúng ngữ cảnh bạn gặp.</li><li>Part of speech chính xác để tránh học lẫn word family.</li><li>Một câu ví dụ bạn thực sự hiểu.</li><li>Topic IELTS để sau này lọc và ôn theo chủ đề.</li></ul>{synonyms.length ? <><hr className="hr" /><b>Synonyms gợi ý</b><div className="tag-cloud">{synonyms.map((value) => <span key={value}>{value}</span>)}</div></> : null}{wordFamily.length ? <><hr className="hr" /><b>Word family</b><div className="tag-cloud">{wordFamily.map((value) => <span key={value}>{value}</span>)}</div></> : null}</aside></div>
  </>;
}
