import type { PartOfSpeech } from '@/lib/types';

function normalizePos(value?: string): PartOfSpeech | undefined {
  switch ((value || '').toLowerCase()) {
    case 'noun': return 'NOUN';
    case 'verb': return 'VERB';
    case 'adjective': return 'ADJECTIVE';
    case 'adverb': return 'ADVERB';
    default: return undefined;
  }
}

export async function POST(request: Request) {
  const { word } = await request.json().catch(() => ({ word: '' }));
  const headword = String(word || '').trim().toLowerCase();
  if (!headword || headword.length > 100) {
    return Response.json({ error: 'Từ không hợp lệ.' }, { status: 400 });
  }

  let dictionary: any = null;
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(headword)}`, { cache: 'no-store' });
    if (response.ok) dictionary = (await response.json())?.[0] ?? null;
  } catch {}

  const firstMeaning = dictionary?.meanings?.[0];
  const firstDefinition = firstMeaning?.definitions?.[0];
  const base = {
    headword,
    ipa: dictionary?.phonetic || dictionary?.phonetics?.find((p: any) => p?.text)?.text || '',
    partOfSpeech: normalizePos(firstMeaning?.partOfSpeech),
    definitionEn: firstDefinition?.definition || '',
    meaningsVi: [] as string[],
    examples: firstDefinition?.example ? [{ en: firstDefinition.example }] : [],
    topicSuggestions: [] as string[],
    wordFamily: [] as string[],
    synonyms: Array.from(new Set([...(firstDefinition?.synonyms || []), ...(firstMeaning?.synonyms || [])])).slice(0, 6)
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ ...base, aiConfigured: false });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const prompt = `You are an IELTS vocabulary assistant. Return ONLY valid JSON, no markdown. Enrich the English vocabulary item "${headword}". Use concise natural Vietnamese translations. JSON schema: {"meaningsVi":["..."],"partOfSpeech":"NOUN|VERB|ADJECTIVE|ADVERB|PHRASAL_VERB|IDIOM|COLLOCATION|OTHER","definitionEn":"...","examples":[{"en":"...","vi":"..."}],"topicSuggestions":["..."],"wordFamily":["..."],"synonyms":["..."]}. Provide 2-4 Vietnamese meanings when genuinely useful, 2 IELTS-appropriate examples, up to 3 topics and up to 6 word-family/synonym items.`;

  try {
    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
      }),
      cache: 'no-store'
    });
    if (!aiResponse.ok) return Response.json({ ...base, aiConfigured:true, aiError:true });
    const payload = await aiResponse.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    const ai = text ? JSON.parse(text) : {};
    return Response.json({
      ...base,
      ...ai,
      ipa: base.ipa,
      definitionEn: ai.definitionEn || base.definitionEn,
      partOfSpeech: ai.partOfSpeech || base.partOfSpeech,
      synonyms: Array.from(new Set([...(ai.synonyms || []), ...base.synonyms])).slice(0, 8),
      aiConfigured: true
    });
  } catch {
    return Response.json({ ...base, aiConfigured:true, aiError:true });
  }
}
