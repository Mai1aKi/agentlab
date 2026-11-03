import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/markdown';

describe('renderMarkdown', () => {
  it('escapes raw HTML so model output cannot inject markup', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders bold, italic and inline code', () => {
    const html = renderMarkdown('这是 **重点** 和 `code` 与 *斜体*');
    expect(html).toContain('<strong>重点</strong>');
    expect(html).toContain('<code class="md-code">code</code>');
    expect(html).toContain('<em>斜体</em>');
  });

  it('does not italicize arithmetic asterisks', () => {
    const html = renderMarkdown('计算 (18 + 26) * 3 - 7 = 125');
    expect(html).not.toContain('<em>');
    expect(html).toContain('* 3 - 7 = 125');
  });

  it('renders fenced code blocks without inline processing inside', () => {
    const html = renderMarkdown('```json\n{"a": "**not bold**"}\n```');
    expect(html).toContain('<pre class="md-pre">');
    expect(html).toContain('**not bold**');
    expect(html).not.toContain('<strong>');
  });

  it('renders tables with header and body cells', () => {
    const html = renderMarkdown('| 工具 | 功能 |\n|---|---|\n| calculator | 计算 |');
    expect(html).toContain('<th>工具</th>');
    expect(html).toContain('<td>calculator</td>');
    expect(html).toContain('<td>计算</td>');
  });

  it('groups consecutive list items into one list', () => {
    const html = renderMarkdown('- 甲\n- 乙\n\n1. 一\n2. 二');
    expect(html.match(/<ul/g)).toHaveLength(1);
    expect(html.match(/<ol/g)).toHaveLength(1);
    expect(html).toContain('<li>甲</li>');
    expect(html).toContain('<li>二</li>');
  });

  it('renders headings and horizontal rules', () => {
    const html = renderMarkdown('## 工具总览\n\n---\n\n### 小节');
    expect(html).toContain('<h2 class="md-h">工具总览</h2>');
    expect(html).toContain('<hr class="md-hr">');
    expect(html).toContain('<h3 class="md-h">小节</h3>');
  });

  it('links only http(s) URLs', () => {
    const ok = renderMarkdown('[文档](https://example.com/x)');
    expect(ok).toContain('<a href="https://example.com/x"');
    const bad = renderMarkdown('[点我](javascript:alert(1))');
    expect(bad).not.toContain('<a href');
  });

  it('renders blockquotes', () => {
    const html = renderMarkdown('> 提示：先想清楚\n> 再动手');
    expect(html).toContain('<blockquote class="md-quote">');
    expect(html).toContain('提示：先想清楚<br>再动手');
  });
});
