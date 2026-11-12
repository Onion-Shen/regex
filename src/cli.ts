#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { formatAst } from './ast.ts';
import { RegexCompileError, RegexSyntaxError } from './errors.ts';
import { Regex, type RegexOptions } from './regex.ts';
import type { Edge } from './nfa.ts';
import { toHtml, toMarkdown, type VisualFormat } from './visualize.ts';

interface CliOptions {
  readonly flags: RegexOptions;
  readonly dotNfa: boolean;
  readonly dotDfa: boolean;
  readonly minimize: boolean;
  readonly format: VisualFormat;
  readonly output: string | null;
  readonly positional: readonly string[];
}

const USAGE = `用法:
  node src/cli.ts test <pattern> <input> [flags]
  node src/cli.ts full <pattern> <input> [flags]
  node src/cli.ts exec <pattern> <input> [from] [flags]
  node src/cli.ts find <pattern> <input> [flags]
  node src/cli.ts replace <pattern> <input> <replacement> [flags]
  node src/cli.ts debug <pattern> [flags] [--dot-nfa] [--dot-dfa] [--min]
  node src/cli.ts visualize <pattern> [flags] [--min] [--format=markdown|html] [--output <file>]

flags: -i 忽略大小写  -m 多行锚点  -s 点号匹配换行  （可组合为 -ims）

visualize:
  默认输出 Markdown（Mermaid 图 + 转移表），可直接在 VS Code 预览；
  --html 生成独立页面（默认写入 regex-visualization.html），用浏览器打开；
  --output <file> 指定输出文件，--output - 强制打印到终端。

示例:
  node src/cli.ts test '(a|b)*abb' 'xxababb'
  node src/cli.ts debug '(a|b)*abb' --dot-dfa --min
  node src/cli.ts visualize '(a|b)*abb' --html
  node src/cli.ts visualize '^a\\d+$' --min
  node src/cli.ts replace 'a+' 'baaac' 'X'`;

function parseArgs(argv: readonly string[]): CliOptions {
  const flags: {
    ignoreCase?: boolean;
    multiline?: boolean;
    dotAll?: boolean;
  } = {};
  const positional: string[] = [];
  let dotNfa = false;
  let dotDfa = false;
  let minimize = false;
  let format: VisualFormat = 'markdown';
  let output: string | null = null;
  let index = 0;

  while (index < argv.length) {
    const arg = argv[index]!;
    index += 1;

    if (arg === '--') {
      positional.push(...argv.slice(index));
      break;
    }

    if (arg === '--dot-nfa') {
      dotNfa = true;
      continue;
    }
    if (arg === '--dot-dfa') {
      dotDfa = true;
      continue;
    }
    if (arg === '--min') {
      minimize = true;
      continue;
    }
    if (arg === '--md' || arg === '--markdown') {
      format = 'markdown';
      continue;
    }
    if (arg === '--html') {
      format = 'html';
      continue;
    }
    if (arg.startsWith('--format=')) {
      format = parseFormat(arg.slice('--format='.length));
      continue;
    }
    if (arg === '--output' || arg === '-o') {
      const value = argv[index];
      if (value === undefined) {
        throw new Error(`参数 ${arg} 需要一个文件路径`);
      }
      output = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--output=')) {
      output = arg.slice('--output='.length);
      continue;
    }
    if (arg.startsWith('--flags=')) {
      applyFlagString(arg.slice('--flags='.length), flags);
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      applyFlagString(arg.slice(1), flags);
      continue;
    }

    positional.push(arg);
  }

  return { flags, dotNfa, dotDfa, minimize, format, output, positional };
}

function parseFormat(value: string): VisualFormat {
  if (value === 'md' || value === 'markdown') {
    return 'markdown';
  }
  if (value === 'html') {
    return 'html';
  }
  throw new Error(`未知输出格式 '${value}'（可用 markdown / html）`);
}

function applyFlagString(text: string, flags: { ignoreCase?: boolean; multiline?: boolean; dotAll?: boolean }): void {
  for (const ch of text) {
    switch (ch) {
      case 'i':
        flags.ignoreCase = true;
        break;
      case 'm':
        flags.multiline = true;
        break;
      case 's':
        flags.dotAll = true;
        break;
      default:
        throw new Error(`未知标志 '${ch}'（可用 i/m/s）`);
    }
  }
}

function requireArg(positional: readonly string[], position: number, name: string): string {
  const value = positional[position];
  if (value === undefined) {
    throw new Error(`缺少参数：${name}`);
  }
  return value;
}

function main(argv: readonly string[]): number {
  const options = parseArgs(argv);
  const [command, ...rest] = options.positional;

  if (command === undefined || command === 'help' || command === '--help') {
    console.log(USAGE);
    return 0;
  }

  const pattern = requireArg(rest, 0, 'pattern');
  const regex = new Regex(pattern, options.flags);

  switch (command) {
    case 'test': {
      const input = requireArg(rest, 1, 'input');
      console.log(regex.test(input));
      return 0;
    }
    case 'full': {
      const input = requireArg(rest, 1, 'input');
      console.log(regex.testFull(input));
      return 0;
    }
    case 'exec': {
      const input = requireArg(rest, 1, 'input');
      const from = rest[2] === undefined ? 0 : Number.parseInt(rest[2], 10);
      const match = regex.exec(input, Number.isNaN(from) ? 0 : from);
      console.log(JSON.stringify(match, null, 2));
      return 0;
    }
    case 'find': {
      const input = requireArg(rest, 1, 'input');
      console.log(JSON.stringify(regex.findAll(input), null, 2));
      return 0;
    }
    case 'replace': {
      const input = requireArg(rest, 1, 'input');
      const replacement = requireArg(rest, 2, 'replacement');
      console.log(regex.replace(input, replacement));
      return 0;
    }
    case 'visualize': {
      const content =
        options.format === 'html'
          ? toHtml(regex, { minimizeOnly: options.minimize })
          : toMarkdown(regex, { minimizeOnly: options.minimize });
      const target =
        options.output ?? (options.format === 'html' ? 'regex-visualization.html' : null);

      if (target === null || target === '-') {
        console.log(content);
      } else {
        writeFileSync(target, content, 'utf8');
        console.log(`已生成 ${target}（${options.format}）`);
      }
      return 0;
    }
    case 'debug': {
      printDebug(regex, options);
      return 0;
    }
    default:
      throw new Error(`未知命令：${command}\n\n${USAGE}`);
  }
}

function printDebug(regex: Regex, options: CliOptions): void {
  console.log(`pattern: ${regex.toString()}`);
  console.log(`\nAST:\n${formatAst(regex.ast)}`);
  console.log(`\nNFA: ${regex.nfa.stateCount} 个状态`);
  printNfaEdges(regex);
  console.log(`charSets: ${regex.nfa.charSets.map((set) => set.toString(32)).join('  ')}`);

  if (options.dotNfa) {
    console.log(`\n${regex.toDot('nfa')}`);
  }

  if (regex.nfa.hasAssertions) {
    console.log('\nDFA: 含锚点，跳过子集构造（请使用 NFA 匹配）');
    return;
  }

  const dfa = regex.toDFA();
  console.log(`\nDFA（子集构造）: ${dfa.stateCount} 个状态, ${dfa.alphabetSize} 个字母表等价类`);
  console.log(dfa.toTable());

  if (options.minimize) {
    const minimal = regex.toDFA(true);
    console.log(`\nDFA（最小化）: ${minimal.stateCount} 个状态`);
    console.log(minimal.toTable());
  }

  if (options.dotDfa) {
    console.log(`\n${(options.minimize ? regex.toDFA(true) : dfa).toDot()}`);
  }
}

function printNfaEdges(regex: Regex): void {
  for (const state of regex.nfa.states) {
    const edges = state.edges.map((edge) => describeEdge(edge)).join(', ');
    const accept = state.accepting ? ' [接受]' : '';
    console.log(`  q${state.id}${accept}${edges === '' ? '' : ` -- ${edges}`}`);
  }
}

function describeEdge(edge: Edge): string {
  if (edge.kind === 'epsilon') {
    return `ε→q${edge.to.id}`;
  }
  if (edge.kind === 'assert') {
    return `${edge.assertion === 'start' ? '^' : '$'}→q${edge.to.id}`;
  }
  return `${edge.set.toString(24)}→q${edge.to.id}`;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof RegexSyntaxError || error instanceof RegexCompileError) {
    console.error(error.message);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
}
