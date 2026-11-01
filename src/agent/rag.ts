// Day 4 · RAG core: document chunking + TF-IDF retrieval.
//
// Pure functions, no dependencies. Text is split into small chunks first,
// then every chunk is indexed as a TF-IDF vector; a query is vectorized
// the same way and ranked by cosine similarity. This replaces the old
// keyword / bigram scoring in kb_search with a real (if tiny) retrieval
// model where rare terms weigh more than common ones.

/** Split text into search terms: Latin words stay whole (keeping a
 *  trailing "+", so "b+" survives), CJK runs contribute every single
 *  character plus every bigram — Chinese has no spaces to split on. */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const terms: string[] = [];
  for (const m of lower.matchAll(/[a-z0-9]+(?:\+)?/g)) terms.push(m[0]);
  const runs = lower.match(/[一-鿿]+/g) ?? [];
  for (const run of runs) {
    for (let i = 0; i < run.length; i++) terms.push(run[i]);
    for (let i = 0; i < run.length - 1; i++) terms.push(run.slice(i, i + 2));
  }
  return terms;
}

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

/** Split a document into retrieval chunks.
 *  Paragraphs (blank-line separated) are kept whole when they fit;
 *  longer paragraphs are packed sentence by sentence, and a single
 *  over-long sentence is hard-sliced with overlap so a fact sitting on
 *  a boundary still appears intact in one chunk. */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = Math.max(20, options.maxChars ?? 120);
  const overlapChars = Math.min(Math.max(0, options.overlapChars ?? 20), maxChars - 1);
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      chunks.push(para);
      continue;
    }
    const sentences = para.match(/[^。！？.!?；;]+[。！？.!?；;]?/g) ?? [para];
    let current = '';
    const flush = () => {
      if (current.length > 0) chunks.push(current);
      current = '';
    };
    for (const raw of sentences) {
      const sentence = raw.trim();
      if (sentence.length === 0) continue;
      if (sentence.length > maxChars) {
        flush();
        const step = maxChars - overlapChars;
        for (let i = 0; i < sentence.length; i += step) {
          chunks.push(sentence.slice(i, i + maxChars));
          if (i + maxChars >= sentence.length) break;
        }
        continue;
      }
      if (current.length > 0 && current.length + sentence.length > maxChars) flush();
      current += sentence;
    }
    flush();
  }
  return chunks;
}

export interface RagDocument {
  title: string;
  text: string;
}

export interface RagChunk {
  title: string;
  index: number;
  text: string;
}

export interface RagHit {
  title: string;
  chunkIndex: number;
  text: string;
  score: number;
}

export interface TfIdfIndex {
  chunks: RagChunk[];
  search: (query: string, topK?: number) => RagHit[];
}

/** Cosine scores below this are treated as "no evidence" — a stray
 *  shared character should not produce a confident-looking hit. */
const MIN_SCORE = 0.05;

export function createTfIdfIndex(documents: RagDocument[], chunkOptions?: ChunkOptions): TfIdfIndex {
  const chunks: RagChunk[] = [];
  for (const doc of documents) {
    chunkText(doc.text, chunkOptions).forEach((text, index) => {
      chunks.push({ title: doc.title, index, text });
    });
  }

  // Document frequency over chunks, then smoothed idf:
  // rare terms get a high weight, terms in every chunk get ~1.
  const df = new Map<string, number>();
  const chunkTerms: Map<string, number>[] = chunks.map((chunk) => {
    const counts = new Map<string, number>();
    // The title is indexed with the chunk so title-only terms still hit,
    // but the stored chunk text stays the document's own words.
    for (const term of tokenize(`${chunk.title} ${chunk.text}`)) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
    for (const term of counts.keys()) df.set(term, (df.get(term) ?? 0) + 1);
    return counts;
  });
  const idf = (term: string): number =>
    Math.log((1 + chunks.length) / (1 + (df.get(term) ?? 0))) + 1;

  const vectors = chunkTerms.map((counts) => {
    const vec = new Map<string, number>();
    let norm = 0;
    for (const [term, count] of counts) {
      const w = count * idf(term);
      vec.set(term, w);
      norm += w * w;
    }
    return { vec, norm: Math.sqrt(norm) };
  });

  function search(query: string, topK = 3): RagHit[] {
    const qCounts = new Map<string, number>();
    for (const term of tokenize(query)) qCounts.set(term, (qCounts.get(term) ?? 0) + 1);
    if (qCounts.size === 0) return [];
    const qVec = new Map<string, number>();
    let qNorm = 0;
    for (const [term, count] of qCounts) {
      if (!df.has(term)) continue;
      const w = count * idf(term);
      qVec.set(term, w);
      qNorm += w * w;
    }
    qNorm = Math.sqrt(qNorm);
    if (qNorm === 0) return [];

    const hits: RagHit[] = [];
    chunks.forEach((chunk, i) => {
      const { vec, norm } = vectors[i];
      if (norm === 0) return;
      let dot = 0;
      for (const [term, qw] of qVec) dot += qw * (vec.get(term) ?? 0);
      const score = dot / (qNorm * norm);
      if (score >= MIN_SCORE) {
        hits.push({ title: chunk.title, chunkIndex: chunk.index, text: chunk.text, score });
      }
    });
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK);
  }

  return { chunks, search };
}
