import { astToNfa, type Nfa } from './nfa.ts';
import { parsePattern } from './parser.ts';
import type { Ast } from './ast.ts';
import { determinize, type Dfa } from './dfa.ts';
import {
  find,
  findAll,
  replace,
  testFull as testFullNfa,
  type Match,
  type Replacement,
} from './matcher.ts';

export interface RegexOptions {
  /** 忽略大小写（作用于编译期字符集）。 */
  readonly ignoreCase?: boolean;
  /** `^` / `$` 匹配每一行的开头/结尾。 */
  readonly multiline?: boolean;
  /** `.` 匹配包括换行在内的任意字符。 */
  readonly dotAll?: boolean;
  /** 量词展开次数上限，默认 1000。 */
  readonly maxRepeat?: number;
  /** NFA 状态数上限，默认 200000。 */
  readonly maxStates?: number;
}

/**
 * 从零实现的正则表达式引擎。
 *
 * 编译期：源码 → Token → AST → Thompson NFA。
 * 匹配期：NFA 集合模拟（最左最长）；DFA 可按需构造用于学习/检查。
 */
export class Regex {
  readonly source: string;
  readonly ignoreCase: boolean;
  readonly multiline: boolean;
  readonly dotAll: boolean;
  readonly ast: Ast;
  readonly nfa: Nfa;
  private normalizedDfa: Dfa | null = null;
  private minimalDfa: Dfa | null = null;

  constructor(source: string, options: RegexOptions = {}) {
    if (typeof source !== 'string') {
      throw new TypeError('正则表达式必须是字符串');
    }

    this.source = source;
    this.ignoreCase = options.ignoreCase === true;
    this.multiline = options.multiline === true;
    this.dotAll = options.dotAll === true;

    const parsed = parsePattern(source, {
      ignoreCase: this.ignoreCase,
      dotAll: this.dotAll,
    });
    this.ast = parsed.ast;
    this.nfa = astToNfa(this.ast, {
      maxRepeat: options.maxRepeat,
      maxStates: options.maxStates,
    });
  }

  get flags(): string {
    return `${this.ignoreCase ? 'i' : ''}${this.multiline ? 'm' : ''}${this.dotAll ? 's' : ''}`;
  }

  get stateCount(): number {
    return this.nfa.stateCount;
  }

  /** 是否存在子串匹配。 */
  test(input: string, fromIndex = 0): boolean {
    return find(this.nfa, input, fromIndex, this.matchOptions()) !== null;
  }

  /** 返回最左侧（最长）匹配。 */
  exec(input: string, fromIndex = 0): Match | null {
    return find(this.nfa, input, fromIndex, this.matchOptions());
  }

  /** 整串匹配的布尔结果。 */
  testFull(input: string): boolean {
    return testFullNfa(this.nfa, input, this.matchOptions());
  }

  /** 整串匹配；成功时返回整个输入作为匹配值。 */
  matchFull(input: string): Match | null {
    if (!testFullNfa(this.nfa, input, this.matchOptions())) {
      return null;
    }
    return { index: 0, end: input.length, value: input };
  }

  /** 返回所有不重叠匹配（空匹配也会按码点推进）。 */
  findAll(input: string): Match[] {
    return findAll(this.nfa, input, this.matchOptions());
  }

  /**
   * 替换所有匹配。替换串支持 `$$`（字面 $）与 `$&`（整个匹配）。
   * 也可以传入函数。
   */
  replace(input: string, replacement: Replacement): string {
    return replace(this.nfa, input, replacement, this.matchOptions());
  }

  /**
   * 子集构造得到 DFA。含锚点时会抛出 RegexCompileError。
   * 结果被缓存；`minimize` 为 true 时返回最小化后的 DFA。
   */
  toDFA(minimize = false): Dfa {
    if (minimize) {
      this.minimalDfa ??= this.toDFA(false).minimize();
      return this.minimalDfa;
    }
    this.normalizedDfa ??= determinize(this.nfa);
    return this.normalizedDfa;
  }

  toDot(target: 'nfa' | 'dfa' = 'nfa'): string {
    return target === 'dfa' ? this.toDFA().toDot() : this.nfa.toDot();
  }

  toString(): string {
    return `/${this.source}/${this.flags}`;
  }

  private matchOptions(): { multiline: boolean } {
    return { multiline: this.multiline };
  }
}

export function compile(source: string, options: RegexOptions = {}): Regex {
  return new Regex(source, options);
}
