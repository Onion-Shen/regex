#!/usr/bin/env node
import { formatAst } from './ast.ts';
import { RegexCompileError, RegexSyntaxError } from './errors.ts';
import { Regex, type RegexOptions } from './regex.ts';
import type { Edge } from './nfa.ts';

interface CliOptions {
  readonly flags: RegexOptions;
  readonly dotNfa: boolean;
  readonly dotDfa: boolean;
  readonly minimize: boolean;
  readonly positional: readonly string[];
}

const USAGE = `用法:
  node src/cli.ts test <pattern> <input> [flags]
  node src/cli.ts full <pattern> <input> [flags]
  node src/cli.ts exec <pattern> <input> [from] [flags]
  node src/cli.ts find <pattern> <input> [flags]
  node src/cli.ts replace <pattern> <input> <replacement> [flags]
  node src/cli.ts debug <pattern> [flags] [--dot-nfa] [--dot-dfa] [--min]

flags: -i 忽略大小写  -m 多行锚点  -s 点号匹配换行  （可组合为 -ims）

示例:
  node src/cli.ts test '(a|b)*abb' 'xxababb'
  node src/cli.ts debug '(a|b)*abb' --dot-dfa --min
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

  return { flags, dotNfa, dotDfa, minimize, positional };
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
