import type { Ast } from './ast.ts';
import type { Dfa } from './dfa.ts';
import type { Nfa } from './nfa.ts';
import type { Regex } from './regex.ts';

export type VisualFormat = 'markdown' | 'html';

export interface VisualizeOptions {
  /** 只展示最小化 DFA，省略原始子集构造结果。 */
  readonly minimizeOnly?: boolean;
}

interface DfaSections {
  readonly raw?: Dfa;
  readonly minimal?: Dfa;
  readonly note?: string;
}

/**
 * 生成 Markdown：AST / NFA / DFA 均为 Mermaid 图，另附 DFA 转移表。
 * VS Code Markdown 预览、GitHub 以及多数 Markdown 编辑器可直接渲染。
 */
export function toMarkdown(regex: Regex, options: VisualizeOptions = {}): string {
  const lines: string[] = [
    `# 正则可视化：<code>${escapeHtml(regex.toString())}</code>`,
    '',
    '> Mermaid 图可在 VS Code Markdown 预览、GitHub 或支持 Mermaid 的编辑器中查看。',
    '',
    '## AST',
    '',
    '```mermaid',
    astToMermaid(regex.ast),
    '```',
    '',
    `## NFA（${regex.nfa.stateCount} 个状态）`,
    '',
    '```mermaid',
    nfaToMermaid(regex.nfa),
    '```',
    '',
  ];

  const sections = collectDfas(regex, options.minimizeOnly === true);
  if (sections.note !== undefined) {
    lines.push('## DFA', '', `> ${sections.note}`, '');
  } else {
    if (sections.raw !== undefined) {
      lines.push(
        `## DFA（子集构造，${sections.raw.stateCount} 状态）`,
        '',
        '```mermaid',
        dfaToMermaid(sections.raw),
        '```',
        '',
        marginNote('红色粗边框为接受状态；省略指向死状态的转移。'),
        '',
        dfaToMarkdownTable(sections.raw),
        '',
      );
    }
    if (sections.minimal !== undefined) {
      lines.push(
        `## DFA（最小化，${sections.minimal.stateCount} 状态）`,
        '',
        '```mermaid',
        dfaToMermaid(sections.minimal),
        '```',
        '',
        marginNote('红色粗边框为接受状态；省略指向死状态的转移。'),
        '',
        dfaToMarkdownTable(sections.minimal),
        '',
      );
    }
  }

  return lines.join('\n');
}

/** 生成可独立打开的 HTML 页面，浏览器通过 CDN 加载 Mermaid 渲染图表。 */
export function toHtml(regex: Regex, options: VisualizeOptions = {}): string {
  const sections: string[] = [
    section('AST', astToMermaid(regex.ast)),
    section(`NFA（${regex.nfa.stateCount} 个状态）`, nfaToMermaid(regex.nfa)),
  ];

  const dfa = collectDfas(regex, options.minimizeOnly === true);
  if (dfa.note !== undefined) {
    sections.push(`<section><h2>DFA</h2><p class="note">${escapeHtml(dfa.note)}</p></section>`);
  } else {
    if (dfa.raw !== undefined) {
      sections.push(
        section(
          `DFA（子集构造，${dfa.raw.stateCount} 状态）`,
          dfaToMermaid(dfa.raw),
          dfaToHtmlTable(dfa.raw),
        ),
      );
    }
    if (dfa.minimal !== undefined) {
      sections.push(
        section(
          `DFA（最小化，${dfa.minimal.stateCount} 状态）`,
          dfaToMermaid(dfa.minimal),
          dfaToHtmlTable(dfa.minimal),
        ),
      );
    }
  }

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>正则可视化：${escapeHtml(regex.toString())}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0 auto; max-width: 1100px; padding: 24px;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.5;
  }
  h1 { font-size: 1.4rem; }
  h2 { margin-top: 2rem; border-bottom: 1px solid #8884; padding-bottom: .3rem; }
  code { background: #8881; padding: .1rem .3rem; border-radius: 4px; }
  pre.mermaid {
    margin: 1rem 0; padding: 1rem; overflow-x: auto;
    background: #8881; border-radius: 8px;
  }
  table { border-collapse: collapse; margin: 1rem 0; font-size: .9rem; }
  th, td { border: 1px solid #8886; padding: .35rem .6rem; text-align: center; }
  th { background: #8882; }
  td.state { text-align: left; }
  .note { color: #888; font-size: .9rem; }
</style>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, securityLevel: 'loose', theme: 'default' });
</script>
</head>
<body>
<h1>正则可视化：<code>${escapeHtml(regex.toString())}</code></h1>
<p class="note">图表由 Mermaid 渲染；首次打开需要网络访问 CDN。红色粗边框为接受状态。</p>
${sections.join('\n')}
</body>
</html>
`;
}

export function astToMermaid(ast: Ast): string {
  const lines: string[] = ['flowchart TD'];
  let nextId = 0;

  const visit = (node: Ast): string => {
    const id = `a${nextId}`;
    nextId += 1;

    switch (node.kind) {
      case 'empty': {
        lines.push(`  ${id}["ε"]`);
        break;
      }
      case 'charset': {
        lines.push(`  ${id}["${escapeMermaid(node.set.toString(18))}"]`);
        break;
      }
      case 'assert': {
        lines.push(`  ${id}["${node.assertion === 'start' ? '^' : '$'}"]`);
        break;
      }
      case 'concat': {
        lines.push(`  ${id}["concat"]`);
        for (const part of node.parts) {
          lines.push(`  ${id} --> ${visit(part)}`);
        }
        break;
      }
      case 'alt': {
        lines.push(`  ${id}["alt"]`);
        for (const option of node.options) {
          lines.push(`  ${id} --> ${visit(option)}`);
        }
        break;
      }
      case 'repeat': {
        const bounds =
          node.max === null
            ? `{${node.min},}`
            : node.min === node.max
              ? `{${node.min}}`
              : `{${node.min},${node.max}}`;
        lines.push(`  ${id}["repeat ${escapeMermaid(bounds)}"]`);
        lines.push(`  ${id} --> ${visit(node.node)}`);
        break;
      }
    }

    return id;
  };

  visit(ast);
  return lines.join('\n');
}

export function nfaToMermaid(nfa: Nfa): string {
  const lines: string[] = [
    'flowchart LR',
    '  startNode((开始))',
    '  classDef initial fill:#e3f2fd,stroke:#1565c0,stroke-width:2px;',
    '  classDef accepting fill:#ffe5e5,stroke:#c62828,stroke-width:3px;',
    `  startNode --> q${nfa.start.id}`,
  ];

  for (const state of nfa.states) {
    lines.push(`  q${state.id}["q${state.id}"]`);
  }

  for (const state of nfa.states) {
    const byTarget = new Map<number, string[]>();
    for (const edge of state.edges) {
      const label =
        edge.kind === 'epsilon'
          ? 'ε'
          : edge.kind === 'assert'
            ? edge.assertion === 'start'
              ? '^'
              : '$'
            : edge.set.toString(18);
      const labels = byTarget.get(edge.to.id) ?? [];
      labels.push(label);
      byTarget.set(edge.to.id, labels);
    }

    for (const [target, labels] of sortedEntries(byTarget)) {
      lines.push(
        `  q${state.id} -- "${labels.map(escapeMermaid).join('<br/>')}" --> q${target}`,
      );
    }
  }

  lines.push(`  class q${nfa.start.id} initial;`);
  for (const state of nfa.states) {
    if (state.accepting) {
      lines.push(`  class q${state.id} accepting;`);
    }
  }

  return lines.join('\n');
}

export function dfaToMermaid(dfa: Dfa): string {
  const lines: string[] = [
    'flowchart LR',
    '  startNode((开始))',
    '  classDef initial fill:#e3f2fd,stroke:#1565c0,stroke-width:2px;',
    '  classDef accepting fill:#ffe5e5,stroke:#c62828,stroke-width:3px;',
    `  startNode --> s${dfa.start}`,
  ];

  for (const state of dfa.states) {
    lines.push(`  s${state.id}["s${state.id}"]`);
  }

  for (const state of dfa.states) {
    const byTarget = new Map<number, string[]>();
    state.transitions.forEach((target, index) => {
      if (target < 0) {
        return;
      }
      const labels = byTarget.get(target) ?? [];
      labels.push(dfa.alphabet[index]!.set.toString(18));
      byTarget.set(target, labels);
    });

    for (const [target, labels] of sortedEntries(byTarget)) {
      lines.push(
        `  s${state.id} -- "${labels.map(escapeMermaid).join('<br/>')}" --> s${target}`,
      );
    }
  }

  lines.push(`  class s${dfa.start} initial;`);
  for (const state of dfa.states) {
    if (state.accepting) {
      lines.push(`  class s${state.id} accepting;`);
    }
  }

  return lines.join('\n');
}

function collectDfas(regex: Regex, minimizeOnly: boolean): DfaSections {
  if (regex.nfa.hasAssertions) {
    return { note: '该表达式包含锚点 ^ / $，位置相关语义无法做子集构造；请查看 NFA。' };
  }

  try {
    const raw = regex.toDFA();
    const minimal = regex.toDFA(true);
    return minimizeOnly ? { minimal } : { raw, minimal };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { note: `DFA 构造失败：${message}` };
  }
}

function dfaToMarkdownTable(dfa: Dfa): string {
  const header = [
    '状态',
    '接受',
    ...dfa.alphabet.map((cls) => escapeMarkdownCell(cls.set.toString(16))),
  ];
  const rows = dfa.states.map((state) => [
    `${state.id === dfa.start ? '→ ' : ''}S${state.id}`,
    state.accepting ? '✓' : '',
    ...state.transitions.map((target) => (target < 0 ? '—' : `S${target}`)),
  ]);

  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeMarkdownCell).join(' | ')} |`),
  ].join('\n');
}

function dfaToHtmlTable(dfa: Dfa): string {
  const header = [
    '<th>状态</th>',
    '<th>接受</th>',
    ...dfa.alphabet.map((cls) => `<th>${escapeHtml(cls.set.toString(16))}</th>`),
  ].join('');

  const rows = dfa.states
    .map((state) => {
      const cells = [
        `<td class="state">${state.id === dfa.start ? '→ ' : ''}S${state.id}</td>`,
        `<td>${state.accepting ? '✓' : ''}</td>`,
        ...state.transitions.map(
          (target) => `<td>${target < 0 ? '—' : `S${target}`}</td>`,
        ),
      ].join('');
      return `<tr>${cells}</tr>`;
    })
    .join('\n');

  return `<table><thead><tr>${header}</tr></thead><tbody>\n${rows}\n</tbody></table>`;
}

function section(title: string, mermaid: string, extra = ''): string {
  // Mermaid 源码里的用户内容已通过 escapeMermaid 转义为 #xx; 实体，
  // 因此这里保持原样，避免把 <br/> 和实体语法转义掉。
  return `<section>
<h2>${escapeHtml(title)}</h2>
<pre class="mermaid">
${mermaid}
</pre>
${extra}
</section>`;
}

function marginNote(text: string): string {
  return `> ${text}`;
}

function sortedEntries(map: Map<number, string[]>): Array<[number, string[]]> {
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

function escapeMermaid(text: string): string {
  return text
    .replace(/&/g, '#amp;')
    .replace(/"/g, '#quot;')
    .replace(/\[/g, '#91;')
    .replace(/\]/g, '#93;')
    .replace(/\{/g, '#123;')
    .replace(/\}/g, '#125;')
    .replace(/\|/g, '#124;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
    .replace(/\n/g, '<br/>');
}

function escapeMarkdownCell(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;')
    .replace(/`/g, '&#96;')
    .replace(/\n/g, '<br/>');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
