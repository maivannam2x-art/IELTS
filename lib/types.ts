export type PartOfSpeech =
  | 'NOUN'
  | 'VERB'
  | 'ADJECTIVE'
  | 'ADVERB'
  | 'PHRASAL_VERB'
  | 'IDIOM'
  | 'COLLOCATION'
  | 'OTHER';

export type VocabEntry = {
  id: string;
  headword: string;
  ipa?: string;
  partOfSpeech: PartOfSpeech;
  meaningVi: string;
  definitionEn?: string;
  exampleEn?: string;
  exampleVi?: string;
  topic: string;
  level?: string;
  entryType: 'WORD' | 'PHRASAL_VERB' | 'COLLOCATION' | 'IDIOM';
  synonyms?: string[];
  wordFamily?: string[];
  createdAt: string;
  intervalDays: number;
  nextReviewAt: string;
  correctCount: number;
  wrongCount: number;
};

export type EnrichmentResult = {
  headword: string;
  ipa?: string;
  partOfSpeech?: PartOfSpeech;
  definitionEn?: string;
  meaningsVi: string[];
  examples: { en: string; vi?: string }[];
  topicSuggestions: string[];
  wordFamily: string[];
  synonyms: string[];
};
