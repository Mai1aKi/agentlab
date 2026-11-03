// Minimal, dependency-free Markdown renderer for assistant messages.
//
// Real models answer in Markdown; rendering those messages as raw
// pre-wrapped text turns tables and headings into an unreadable wall
// (that is exactly what users complained about). This renderer covers
// the subset models actually use — headings, bold/italic, inline code,
// fenced code blocks, lists, blockquotes, tables, rules, http(s) links.
//
// Safety: the input is HTML-escaped first; every transform below runs
// on the escaped text, and link URLs are restricted to http(s), so a
// model reply cannot inject markup.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(s: string): string {
  return s
    .replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    );
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}

const BLOCK_START = /^(#{1,4}\s|```|\s*[-*]\s|\s*\d+[.)]\s|\s*\||\s*>)/;

export function renderMarkdown(src: string): string {
  const lines = escapeHtml(src).split('\n');
  const out: string[] = [];
  let i = 0;
  let listTag: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (listTag) {
      out.push(`</${listTag}>`);
      listTag = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line.trim())) {
      closeList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push(`<pre class="md-pre"><code>${buf.join('\n')}</code></pre>`);
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      closeList();
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const thead = header.map((c) => `<th>${inline(c)}</th>`).join('');
      const tbody = rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('');
      out.push(
        `<div class="md-table"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`,
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level} class="md-h">${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      closeList();
      out.push('<hr class="md-hr">');
      i++;
      continue;
    }

    if (/^\s*&gt;\s?/.test(line)) {
      closeList();
      const buf: string[] = [];
      while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*&gt;\s?/, ''));
        i++;
      }
      out.push(
        `<blockquote class="md-quote">${buf.map((b) => inline(b)).join('<br>')}</blockquote>`,
      );
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const tag = bullet ? 'ul' : 'ol';
      if (listTag !== tag) {
        closeList();
        out.push(`<${tag} class="md-list">`);
        listTag = tag;
      }
      out.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
      i++;
      continue;
    }

    closeList();
    if (line.trim() === '') {
      i++;
      continue;
    }

    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !BLOCK_START.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p class="md-p">${inline(buf.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }
  closeList();
  return out.join('\n');
}
