// Day 25 · Knowledge-base hit citations: every kb_search hit is
// annotated with where it came from — which document, which chunk,
// which query terms actually matched, and the retrieval score — so a
// reader (and the model) can tell why a fragment was surfaced instead
// of trusting a bare snippet.
//
// Pure functions, no dependencies. The chunk text itself is never
// rewritten: highlighting markers inside the text would corrupt the
// very words the model is supposed to quote, so the citation rides on
// its own line below the fragment.

import { tokenize, type RagHit} from './rag';

/** At most this many matched terms are listed on a citation line —
* enough to explain the hit without turning it into a term dump. */
export const MAX_CITED_TERMS = 5;

/** Query terms that actually occur in a hit (its title or chunk text),
* deduplicated, in query order. Two-character-and-longer terms are
* preferred: single CJK characters match almost anything, so they are
* only used when nothing longer matched (e.g. a one-character query). */
export function matchedKbTerms(query: unknown, hit: RagHit): string[] {
if (typeof query!== 'string') return [];
const hitTerms = new Set(tokenize(`${hit.title} ${hit.text}`));
const seen = new Set<string>();
const matched: string[] = [];
const singleChar: string[] = [];
for (const term of tokenize(query)) {
if (seen.has(term) ||!hitTerms.has(term)) continue;
seen.add(term);
if (term.length >= 2) matched.push(term);
else singleChar.push(term);
}
const terms = matched.length > 0? matched: singleChar;
return terms.slice(0, MAX_CITED_TERMS);
}

/** Sanitize a retrieval score for display: non-finite or negative
* scores render as 0, and the value is fixed to two decimals. */
export function formatKbScore(score: unknown): string {
const value = typeof score === 'number' && Number.isFinite(score) && score > 0? score: 0;
return value.toFixed(2);
}

/** One-line source annotation for a hit, e.g.
* "出处：《RAG（检索增强生成）》片段 1 · 命中：rag、检索 · 相关度 0.42".
* Chunk numbers are 1-based for readers; a hit with no matched terms
* (should not happen from the real index) says so instead of lying. */
export function formatKbHitSource(hit: RagHit, query: unknown): string {
const chunkNo = Number.isFinite(hit.chunkIndex) && hit.chunkIndex >= 0
? Math.floor(hit.chunkIndex) + 1
: 1;
const terms = matchedKbTerms(query, hit);
const matched = terms.length > 0? terms.join('、'): '无明确命中词';
return `出处：《${hit.title}》片段 ${chunkNo} · 命中：${matched} · 相关度 ${formatKbScore(hit.score)}`;
}

/** A hit rendered for kb_search: the original fragment, untouched,
* followed by its citation line. */
export function formatKbHit(hit: RagHit, query: unknown): string {
return `${hit.text}\n ↳ ${formatKbHitSource(hit, query)}`;
}
