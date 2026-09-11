'use client';

import type { VocabEntry } from './types';
import { sampleWords } from './sample-data';

const KEY = 'ielts-vocab-trainer.words.v1';

export function loadWords(): VocabEntry[] {
  if (typeof window === 'undefined') return sampleWords;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(sampleWords));
      return sampleWords;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : sampleWords;
  } catch {
    return sampleWords;
  }
}

export function saveWords(words: VocabEntry[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(words));
}

export function exportCsv(words: VocabEntry[]) {
  const headers = ['word','pos','meaning_vi','definition_en','example_en','example_vi','topic','level','type','correct','wrong'];
  const rows = words.map(w => [w.headword,w.partOfSpeech,w.meaningVi,w.definitionEn || '',w.exampleEn || '',w.exampleVi || '',w.topic,w.level || '',w.entryType,String(w.correctCount),String(w.wrongCount)]);
  const esc = (v: string) => `"${v.replaceAll('"','""')}"`;
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ielts-vocabulary-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
