'use client';

import { useEffect, useMemo, useState } from 'react';
import { exportCsv, loadWords, saveWords } from '@/lib/local-store';
import type { EnrichmentResult, PartOfSpeech, VocabEntry } from '@/lib/types';

type View = 'today' | 'vocabulary' | 'flashcards' | 'practice' | 'phrasal' | 'add';
type PracticeMode = 'VI_EN' | 'EN_VI' | 'MCQ' | 'FILL';

const views: { key: View; label: string }[] = [
  { key:'today', label:'🏠 Hôm nay' },
  { key:'vocabulary', label:'📖 Từ vựng' },
  { key:'phrasal', label:'🧩 Phrasal verbs' },
  { key:'flashcards', label:'🃏 Flashcards' },
  { key:'practice', label:'✏️ Luyện tập' },
  { key:'add', label:'➕ Thêm từ' },
];

const posValues: PartOfSpeech[] = ['NOUN','VERB','ADJECTIVE','ADVERB','PHRASAL_VERB','COLLOCATION','IDIOM','OTHER'];
const normalize = (v: string) => v.trim().toLowerCase().replace(/[.,!?;:]/g,'').replace(/\s+/g,' ');
const plusDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const uid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);

export default function VocabApp() {
  const [view, setView] = useState<View>('today');
  const [words, setWords] = useState<VocabEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('VI_EN');
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ text:string; good?:boolean }>({ text:'' });

  useEffect(() => {
    setWords(loadWords());
    setReady(true);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  useEffect(() => { if (ready) saveWords(words); }, [words, ready]);

  const dueWords = useMemo(() => words.filter(w => new Date(w.nextReviewAt).getTime() <= Date.now()), [words]);
  const mastered = words.filter(w => w.correctCount >= 5 && w.correctCount > w.wrongCount * 2).length;
  const weak = words.filter(w => w.wrongCount > w.correctCount).length;
  const filtered = words.filter(w => {
    const q = normalize(query);
    const matchQ = !q || normalize(`${w.headword} ${w.meaningVi} ${w.topic}`).includes(q);
    const matchPos = posFilter === 'ALL' || w.partOfSpeech === posFilter;
    return matchQ && matchPos;
  });
  const phrasal = words.filter(w => w.partOfSpeech === 'PHRASAL_VERB' || w.entryType === 'PHRASAL_VERB');

  function markReview(id: string, result: 'again'|'hard'|'good'|'easy') {
    setWords(prev => prev.map(w => {
      if (w.id !== id) return w;
      const mapping = { again:1, hard:Math.max(2,w.intervalDays), good:Math.max(3,Math.round(w.intervalDays*1.8)), easy:Math.max(7,Math.round(w.intervalDays*2.7)) };
      const success = result !== 'again';
      return { ...w, intervalDays:mapping[result], nextReviewAt:plusDays(mapping[result]), correctCount:w.correctCount+(success?1:0), wrongCount:w.wrongCount+(success?0:1) };
    }));
    setRevealed(false);
    setCardIndex(i => words.length ? (i + 1) % words.length : 0);
  }

  function deleteWord(id:string) { setWords(prev => prev.filter(w => w.id !== id)); }

  const practicePool = dueWords.length ? dueWords : words;
  const currentPractice = practicePool.length ? practicePool[practiceIndex % practicePool.length] : null;
  const currentCard = words.length ? words[cardIndex % words.length] : null;

  function nextPractice() {
    setAnswer(''); setFeedback({ text:'' });
    setPracticeIndex(i => practicePool.length ? (i+1)%practicePool.length : 0);
  }

  function submitPractice(candidate = answer) {
    if (!currentPractice) return;
    let expected = '';
    let ok = false;
    if (practiceMode === 'VI_EN') { expected = currentPractice.headword; ok = normalize(candidate) === normalize(expected); }
    if (practiceMode === 'EN_VI' || practiceMode === 'MCQ') {
      expected = currentPractice.meaningVi;
      const acceptable = currentPractice.meaningVi.split(/[;,/]/).map(normalize).filter(Boolean);
      ok = acceptable.some(v => normalize(candidate).includes(v) || v.includes(normalize(candidate)));
    }
    if (practiceMode === 'FILL') { expected = currentPractice.headword; ok = normalize(candidate) === normalize(expected); }
    setFeedback({ text: ok ? `✓ Chính xác — ${currentPractice.headword}: ${currentPractice.meaningVi}` : `✗ Đáp án: ${expected}`, good:ok });
    setWords(prev => prev.map(w => w.id === currentPractice.id ? { ...w, correctCount:w.correctCount+(ok?1:0), wrongCount:w.wrongCount+(ok?0:1), nextReviewAt:ok?plusDays(Math.max(2,w.intervalDays)):plusDays(1), intervalDays:ok?Math.max(2,Math.round(w.intervalDays*1.5)):1 } : w));
  }

  const mcqOptions = useMemo(() => {
    if (!currentPractice) return [];
    const others = words.filter(w => w.id !== currentPractice.id).map(w => w.meaningVi).sort(() => Math.random() - .5).slice(0,3);
    return [currentPractice.meaningVi, ...others].sort(() => Math.random() - .5);
  }, [currentPractice?.id, practiceMode, words.length]);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand">IELTS VOCAB<small>Personal trainer</small></div>
      <nav className="nav">{views.map(v => <button key={v.key} className={view===v.key?'active':''} onClick={() => setView(v.key)}>{v.label}</button>)}</nav>
    </aside>
    <div className="mobile-nav">{views.map(v => <button key={v.key} className={view===v.key?'active':''} onClick={() => setView(v.key)}>{v.label}</button>)}</div>
    <main className="main"><div className="container">
      {view === 'today' && <TodayView total={words.length} due={dueWords.length} mastered={mastered} weak={weak} onStart={() => { setView('flashcards'); setCardIndex(0); }} />}
      {view === 'vocabulary' && <VocabularyView words={filtered} query={query} setQuery={setQuery} posFilter={posFilter} setPosFilter={setPosFilter} deleteWord={deleteWord} onExport={() => exportCsv(words)} />}
      {view === 'phrasal' && <PhrasalView words={phrasal} onAdd={() => setView('add')} />}
      {view === 'flashcards' && <FlashcardView word={currentCard} index={cardIndex} total={words.length} revealed={revealed} setRevealed={setRevealed} next={() => { setCardIndex(i => words.length ? (i+1)%words.length : 0); setRevealed(false); }} markReview={markReview} />}
      {view === 'practice' && <PracticeView words={words} current={currentPractice} mode={practiceMode} setMode={m => { setPracticeMode(m); setAnswer(''); setFeedback({text:''}); }} answer={answer} setAnswer={setAnswer} submit={submitPractice} next={nextPractice} feedback={feedback} options={mcqOptions} />}
      {view === 'add' && <AddWordView onAdd={word => { setWords(prev => [word, ...prev]); setView('vocabulary'); }} existing={words} />}
    </div></main>
  </div>;
}

function Header({ title, subtitle, action }:{title:string; subtitle:string; action?:React.ReactNode}) {
  return <div className="topbar"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function TodayView({ total,due,mastered,weak,onStart }:{total:number;due:number;mastered:number;weak:number;onStart:()=>void}) {
  return <>
    <Header title="Hôm nay" subtitle="Ôn đúng những từ cần thiết, không học ngẫu nhiên." action={<span className="badge">Daily IELTS</span>} />
    <div className="grid grid-4">
      <div className="card"><div className="stat-label">Tổng từ</div><div className="stat-value">{total}</div></div>
      <div className="card"><div className="stat-label">Cần ôn hôm nay</div><div className="stat-value">{due}</div></div>
      <div className="card"><div className="stat-label">Đã vững</div><div className="stat-value">{mastered}</div></div>
      <div className="card"><div className="stat-label">Từ yếu</div><div className="stat-value">{weak}</div></div>
    </div>
    <div className="grid grid-2" style={{marginTop:16}}>
      <section className="card"><div className="kicker">Daily review</div><h2 className="section-title" style={{marginTop:8}}>Ôn tập theo Spaced Repetition</h2><p className="muted">Flashcard sẽ ghi nhận Again / Hard / Good / Easy và tự dời lịch ôn tiếp theo.</p><button className="btn primary" onClick={onStart}>Bắt đầu ôn →</button></section>
      <section className="card"><div className="kicker">Lộ trình</div><h2 className="section-title" style={{marginTop:8}}>Học → nhớ → dùng được</h2><div className="progress"><span style={{width:`${total?Math.round(mastered/total*100):0}%`}} /></div><p className="muted">{total?Math.round(mastered/total*100):0}% kho từ đang ở trạng thái tương đối vững.</p></section>
    </div>
  </>;
}

function VocabularyView({ words,query,setQuery,posFilter,setPosFilter,deleteWord,onExport }:{words:VocabEntry[];query:string;setQuery:(s:string)=>void;posFilter:string;setPosFilter:(s:string)=>void;deleteWord:(id:string)=>void;onExport:()=>void}) {
  return <>
    <Header title="Kho từ vựng" subtitle="Phân biệt rõ noun / verb / adjective / adverb và các nhóm IELTS." action={<button className="btn" onClick={onExport}>Export CSV cho Excel</button>} />
    <div className="card">
      <div className="search-row"><input className="input" placeholder="Tìm theo từ, nghĩa hoặc topic..." value={query} onChange={e=>setQuery(e.target.value)} /><select className="select" style={{maxWidth:190}} value={posFilter} onChange={e=>setPosFilter(e.target.value)}><option value="ALL">Tất cả POS</option>{posValues.map(p=><option key={p}>{p}</option>)}</select></div>
      {words.length ? <table className="word-table"><thead><tr><th>Từ</th><th>POS</th><th>Nghĩa</th><th>Topic</th><th>Ví dụ</th><th></th></tr></thead><tbody>{words.map(w=><tr key={w.id}><td><strong>{w.headword}</strong><div className="muted" style={{fontSize:12}}>{w.ipa}</div></td><td><span className="pos">{w.partOfSpeech}</span></td><td>{w.meaningVi}</td><td>{w.topic}</td><td className="muted" style={{maxWidth:320}}>{w.exampleEn || '—'}</td><td><button className="btn danger" onClick={()=>deleteWord(w.id)}>Xóa</button></td></tr>)}</tbody></table> : <div className="empty">Không tìm thấy từ phù hợp.</div>}
    </div>
  </>;
}

function PhrasalView({words,onAdd}:{words:VocabEntry[];onAdd:()=>void}) {
  return <><Header title="Phrasal verbs" subtitle="Học riêng cụm động từ, nghĩa, cấu trúc và ví dụ." action={<button className="btn primary" onClick={onAdd}>+ Thêm phrasal verb</button>} />
    <div className="grid grid-2">{words.map(w=><article className="card" key={w.id}><span className="pos">PHRASAL VERB</span><h2 style={{marginBottom:4}}>{w.headword}</h2><strong>{w.meaningVi}</strong><p className="muted">{w.definitionEn}</p><hr className="hr"/><div><b>Example</b><p>{w.exampleEn}</p></div>{w.synonyms?.length?<div><b>Gần nghĩa:</b> {w.synonyms.join(', ')}</div>:null}</article>)}{!words.length&&<div className="card empty">Chưa có phrasal verb.</div>}</div>
  </>;
}

function FlashcardView({word,index,total,revealed,setRevealed,next,markReview}:{word:VocabEntry|null;index:number;total:number;revealed:boolean;setRevealed:(v:boolean)=>void;next:()=>void;markReview:(id:string,r:'again'|'hard'|'good'|'easy')=>void}) {
  return <><Header title="Flashcards" subtitle="Lật thẻ và tự đánh giá mức độ nhớ." action={<span className="badge">{total?index%total+1:0} / {total}</span>} />
    {!word?<div className="card empty">Hãy thêm từ để bắt đầu.</div>:<div className="card flashcard"><div style={{maxWidth:700}}><span className="pos">{word.partOfSpeech}</span><div className="flash-word">{word.headword}</div><div className="muted">{word.ipa}</div>{!revealed?<button className="btn primary" style={{marginTop:24}} onClick={()=>setRevealed(true)}>Hiện đáp án</button>:<><div className="flash-meaning">{word.meaningVi}</div>{word.definitionEn&&<p>{word.definitionEn}</p>}{word.exampleEn&&<div className="callout" style={{marginTop:16,textAlign:'left'}}>{word.exampleEn}</div>}<div className="actions" style={{justifyContent:'center',marginTop:22}}><button className="btn danger" onClick={()=>markReview(word.id,'again')}>Again</button><button className="btn" onClick={()=>markReview(word.id,'hard')}>Hard</button><button className="btn success" onClick={()=>markReview(word.id,'good')}>Good</button><button className="btn primary" onClick={()=>markReview(word.id,'easy')}>Easy</button></div></>}<div style={{marginTop:16}}><button className="btn ghost" onClick={next}>Bỏ qua →</button></div></div></div>}
  </>;
}

function PracticeView({words,current,mode,setMode,answer,setAnswer,submit,next,feedback,options}:{words:VocabEntry[];current:VocabEntry|null;mode:PracticeMode;setMode:(m:PracticeMode)=>void;answer:string;setAnswer:(s:string)=>void;submit:(candidate?:string)=>void;next:()=>void;feedback:{text:string;good?:boolean};options:string[]}) {
  const fillSentence = current?.exampleEn ? current.exampleEn.replace(new RegExp(current.headword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'_____') : '';
  return <><Header title="Luyện tập" subtitle="Gõ nghĩa, viết từ, trắc nghiệm hoặc điền vào câu." />
    <div className="actions" style={{marginBottom:14}}><button className={`btn ${mode==='VI_EN'?'primary':''}`} onClick={()=>setMode('VI_EN')}>Việt → Anh</button><button className={`btn ${mode==='EN_VI'?'primary':''}`} onClick={()=>setMode('EN_VI')}>Anh → Việt</button><button className={`btn ${mode==='MCQ'?'primary':''}`} onClick={()=>setMode('MCQ')}>Trắc nghiệm</button><button className={`btn ${mode==='FILL'?'primary':''}`} onClick={()=>setMode('FILL')}>Điền câu</button></div>
    {!words.length||!current?<div className="card empty">Chưa có từ để kiểm tra.</div>:<section className="card" style={{maxWidth:800}}>
      <div className="kicker">{current.topic} · {current.partOfSpeech}</div>
      <h2 style={{fontSize:28}}>{mode==='VI_EN'?current.meaningVi:mode==='FILL'?(fillSentence||`Điền từ có nghĩa: ${current.meaningVi}`):current.headword}</h2>
      {mode==='MCQ'?<div className="option-list">{options.map(o=><button key={o} className="btn" onClick={()=>submit(o)}>{o}</button>)}</div>:<form onSubmit={e=>{e.preventDefault();submit();}}><input className="input" style={{marginTop:10}} autoComplete="off" placeholder={mode==='VI_EN'||mode==='FILL'?'Nhập từ tiếng Anh...':'Nhập nghĩa tiếng Việt...'} value={answer} onChange={e=>setAnswer(e.target.value)} /><div className="actions" style={{marginTop:12}}><button className="btn primary" type="submit">Kiểm tra</button><button className="btn" type="button" onClick={next}>Câu tiếp →</button></div></form>}
      <div className={`feedback ${feedback.good===true?'good':feedback.good===false?'bad':''}`}>{feedback.text}</div>
    </section>}
  </>;
}

function AddWordView({onAdd,existing}:{onAdd:(w:VocabEntry)=>void;existing:VocabEntry[]}) {
  const [headword,setHeadword]=useState(''); const [meaning,setMeaning]=useState(''); const [pos,setPos]=useState<PartOfSpeech>('NOUN');
  const [ipa,setIpa]=useState(''); const [definition,setDefinition]=useState(''); const [example,setExample]=useState(''); const [exampleVi,setExampleVi]=useState('');
  const [topic,setTopic]=useState('General'); const [level,setLevel]=useState(''); const [entryType,setEntryType]=useState<VocabEntry['entryType']>('WORD');
  const [suggestions,setSuggestions]=useState<string[]>([]); const [wordFamily,setWordFamily]=useState<string[]>([]); const [synonyms,setSynonyms]=useState<string[]>([]);
  const [loading,setLoading]=useState(false); const [message,setMessage]=useState('');

  async function enrich() {
    if (!headword.trim()) { setMessage('Nhập từ trước khi tra.'); return; }
    setLoading(true); setMessage('Đang tra dictionary và AI nếu đã cấu hình...');
    try {
      const r = await fetch('/api/enrich',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:headword})});
      const data = await r.json() as EnrichmentResult & {aiConfigured?:boolean;aiError?:boolean};
      if (!r.ok) throw new Error((data as any).error || 'Lookup failed');
      setIpa(data.ipa || ''); if(data.partOfSpeech) setPos(data.partOfSpeech); setDefinition(data.definitionEn || '');
      setSuggestions(data.meaningsVi || []); setWordFamily(data.wordFamily || []); setSynonyms(data.synonyms || []);
      if(data.examples?.[0]) { setExample(data.examples[0].en || ''); setExampleVi(data.examples[0].vi || ''); }
      if(data.topicSuggestions?.[0]) setTopic(data.topicSuggestions[0]);
      setMessage(data.aiConfigured ? (data.aiError?'Dictionary đã trả kết quả; AI đang lỗi hoặc hết quota.':'Đã lấy gợi ý từ dictionary + AI.') : 'Đã lấy dictionary. Thêm GEMINI_API_KEY để có gợi ý nghĩa tiếng Việt tự động.');
    } catch(e:any) { setMessage(e?.message || 'Không thể tra từ.'); }
    finally { setLoading(false); }
  }

  function save() {
    if(!headword.trim()||!meaning.trim()) { setMessage('Từ và nghĩa tiếng Việt là bắt buộc.'); return; }
    if(existing.some(w=>normalize(w.headword)===normalize(headword)&&w.partOfSpeech===pos)) { setMessage('Từ này với cùng loại từ đã tồn tại.'); return; }
    const word:VocabEntry={id:uid(),headword:headword.trim(),ipa:ipa.trim(),partOfSpeech:pos,meaningVi:meaning.trim(),definitionEn:definition.trim(),exampleEn:example.trim(),exampleVi:exampleVi.trim(),topic:topic.trim()||'General',level:level.trim(),entryType,wordFamily,synonyms,createdAt:new Date().toISOString(),intervalDays:1,nextReviewAt:new Date().toISOString(),correctCount:0,wrongCount:0};
    onAdd(word);
  }

  return <><Header title="Thêm từ mới" subtitle="Nhập một từ rồi để hệ thống gợi ý IPA, POS, nghĩa, ví dụ và word family." />
    <div className="card"><div className="form-grid">
      <div className="field full"><label>Từ / cụm từ *</label><div className="actions" style={{flexWrap:'nowrap'}}><input className="input" value={headword} onChange={e=>setHeadword(e.target.value)} placeholder="Ví dụ: deteriorate / carry out"/><button className="btn primary" disabled={loading} onClick={enrich}>{loading?'Đang tra...':'Tra & gợi ý'}</button></div></div>
      <div className="field"><label>Part of speech *</label><select className="select" value={pos} onChange={e=>setPos(e.target.value as PartOfSpeech)}>{posValues.map(p=><option key={p}>{p}</option>)}</select></div>
      <div className="field"><label>Loại entry</label><select className="select" value={entryType} onChange={e=>setEntryType(e.target.value as VocabEntry['entryType'])}><option>WORD</option><option>PHRASAL_VERB</option><option>COLLOCATION</option><option>IDIOM</option></select></div>
      <div className="field"><label>IPA</label><input className="input" value={ipa} onChange={e=>setIpa(e.target.value)} /></div>
      <div className="field"><label>CEFR</label><input className="input" value={level} onChange={e=>setLevel(e.target.value)} placeholder="B2 / C1" /></div>
      <div className="field full"><label>Nghĩa tiếng Việt *</label><input className="input" value={meaning} onChange={e=>setMeaning(e.target.value)} placeholder="Chọn gợi ý bên dưới hoặc tự nhập" />{suggestions.length?<div className="actions" style={{marginTop:8}}>{suggestions.map(s=><button key={s} type="button" className="btn" onClick={()=>setMeaning(s)}>{s}</button>)}</div>:null}</div>
      <div className="field full"><label>English definition</label><textarea className="textarea" value={definition} onChange={e=>setDefinition(e.target.value)} /></div>
      <div className="field full"><label>Example sentence</label><textarea className="textarea" value={example} onChange={e=>setExample(e.target.value)} /></div>
      <div className="field full"><label>Dịch câu ví dụ</label><textarea className="textarea" value={exampleVi} onChange={e=>setExampleVi(e.target.value)} /></div>
      <div className="field"><label>IELTS topic</label><input className="input" value={topic} onChange={e=>setTopic(e.target.value)} /></div>
      <div className="field"><label>Word family</label><input className="input" value={wordFamily.join(', ')} onChange={e=>setWordFamily(e.target.value.split(',').map(v=>v.trim()).filter(Boolean))} /></div>
      <div className="field full"><label>Synonyms</label><input className="input" value={synonyms.join(', ')} onChange={e=>setSynonyms(e.target.value.split(',').map(v=>v.trim()).filter(Boolean))} /></div>
    </div><div className="feedback">{message}</div><div className="actions" style={{marginTop:12}}><button className="btn primary" onClick={save}>Lưu vào kho từ</button></div></div>
  </>;
}
