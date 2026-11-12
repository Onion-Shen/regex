import { CharSet, MAX_CODE_POINT } from './charset.ts';
import { RegexCompileError } from './errors.ts';
import type { Nfa, NfaState } from './nfa.ts';

export interface CharClass {
  /** 该等价类包含的码点集合。 */
  readonly set: CharSet;
  /** 用于代表该类参与转移计算的码点。 */
  readonly representative: number;
}

export interface DfaState {
  readonly id: number;
  readonly accepting: boolean;
  /** 按字母表等价类索引；-1 表示没有转移（死状态）。 */
  readonly transitions: readonly number[];
  /** 子集构造中该 DFA 状态包含的 NFA 状态。 */
  readonly nfaStates: readonly number[];
}

interface LookupEntry {
  readonly lo: number;
  readonly hi: number;
  readonly index: number;
}

export class Dfa {
  readonly states: readonly DfaState[];
  readonly alphabet: readonly CharClass[];
  readonly start: number;
  private readonly lookup: readonly LookupEntry[];

  constructor(states: readonly DfaState[], alphabet: readonly CharClass[], start: number) {
    this.states = states;
    this.alphabet = alphabet;
    this.start = start;
    this.lookup = buildLookup(alphabet);
  }

  get stateCount(): number {
    return this.states.length;
  }

  get alphabetSize(): number {
    return this.alphabet.length;
  }

  get acceptingStates(): readonly DfaState[] {
    return this.states.filter((state) => state.accepting);
  }

  /** 返回码点所在的字母表等价类索引；没有字符边覆盖时返回 -1。 */
  classOf(cp: number): number {
    let low = 0;
    let high = this.lookup.length - 1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const entry = this.lookup[mid]!;
      if (cp < entry.lo) {
        high = mid - 1;
      } else if (cp > entry.hi) {
        low = mid + 1;
      } else {
        return entry.index;
      }
    }

    return -1;
  }

  /** 整串匹配（隐式 ^...$）。 */
  testFull(input: string): boolean {
    if (typeof input !== 'string') {
      throw new TypeError('输入必须是字符串');
    }
    if (this.states.length === 0) {
      return false;
    }

    let state = this.start;
    for (const ch of input) {
      const cp = ch.codePointAt(0)!;
      const cls = this.classOf(cp);
      if (cls < 0) {
        return false;
      }
      const next = this.states[state]!.transitions[cls]!;
      if (next < 0) {
        return false;
      }
      state = next;
    }

    return this.states[state]!.accepting;
  }

  minimize(): Dfa {
    return minimizeDfa(this);
  }

  toTable(): string {
    const header = ['状态', '接受', ...this.alphabet.map((cls) => cls.set.toString(16))];
    const rows = this.states.map((state) => [
      `${state.accepting ? '→' : ' '}S${state.id}`,
      state.accepting ? '✓' : '',
      ...state.transitions.map((target) => (target < 0 ? '—' : `S${target}`)),
    ]);
    const widths = header.map((_, column) =>
      Math.max(header[column]!.length, ...rows.map((row) => row[column]!.length)),
    );
    const format = (row: readonly string[]): string =>
      row.map((cell, column) => cell.padEnd(widths[column]!)).join('  ');

    return [format(header), ...rows.map(format)].join('\n');
  }

  toDot(): string {
    const lines: string[] = [
      'digraph DFA {',
      '  rankdir=LR;',
      '  node [shape=circle, fontsize=10];',
      '  start [shape=point, width=0.1];',
      `  start -> s${this.start};`,
    ];

    for (const state of this.states) {
      if (state.accepting) {
        lines.push(`  s${state.id} [shape=doublecircle, peripheries=2];`);
      }
    }

    for (const state of this.states) {
      const byTarget = new Map<number, string[]>();
      state.transitions.forEach((target, index) => {
        if (target < 0) {
          return;
        }
        const labels = byTarget.get(target) ?? [];
        labels.push(this.alphabet[index]!.set.toString(24));
        byTarget.set(target, labels);
      });

      for (const [target, labels] of byTarget) {
        lines.push(`  s${state.id} -> s${target} [label="${escapeDot(labels.join(', '))}"];`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }
}

/**
 * 子集构造：NFA → DFA。
 *
 * 锚点（^ / $）依赖输入位置，无法直接做位置无关的子集构造，
 * 因此含锚点的表达式请使用 NFA 匹配器（Regex 默认就是 NFA）。
 */
export function determinize(nfa: Nfa): Dfa {
  if (nfa.hasAssertions) {
    throw new RegexCompileError('子集构造暂不支持锚点 ^ / $；请使用 NFA 匹配');
  }

  const alphabet = buildAlphabet(nfa.charSets);
  const subsets: Array<{ states: NfaState[]; accepting: boolean }> = [];
  const transitions: number[][] = [];
  const byKey = new Map<string, number>();
  const queue: number[] = [];

  const intern = (states: NfaState[]): number => {
    const key = states.map((state) => state.id).join(',');
    const existing = byKey.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const id = subsets.length;
    byKey.set(key, id);
    subsets.push({ states, accepting: states.some((state) => state.accepting) });
    transitions.push([]);
    queue.push(id);
    return id;
  };

  const start = intern(epsilonClosure([nfa.start]));
  let head = 0;

  while (head < queue.length) {
    const id = queue[head]!;
    head += 1;
    const subset = subsets[id]!;
    const row: number[] = [];

    for (const cls of alphabet) {
      const targets = new Set<NfaState>();
      for (const state of subset.states) {
        for (const edge of state.edges) {
          if (edge.kind === 'charset' && edge.set.contains(cls.representative)) {
            targets.add(edge.to);
          }
        }
      }

      if (targets.size === 0) {
        row.push(-1);
      } else {
        row.push(intern(epsilonClosure(targets)));
      }
    }

    transitions[id] = row;
  }

  const states: DfaState[] = subsets.map((subset, id) => ({
    id,
    accepting: subset.accepting,
    transitions: transitions[id]!,
    nfaStates: subset.states.map((state) => state.id),
  }));

  return new Dfa(states, alphabet, start);
}

/** Moore 分区细化最小化。 */
export function minimizeDfa(dfa: Dfa): Dfa {
  if (dfa.states.length === 0) {
    return dfa;
  }

  let block: number[] = dfa.states.map((state) => (state.accepting ? 1 : 0));

  while (true) {
    const signatureToBlock = new Map<string, number>();
    const nextBlock: number[] = [];

    for (const state of dfa.states) {
      const signature = `${block[state.id]!}|${state.accepting ? 1 : 0}|${state.transitions
        .map((target) => (target < 0 ? -1 : block[target]!))
        .join(',')}`;
      let id = signatureToBlock.get(signature);
      if (id === undefined) {
        id = signatureToBlock.size;
        signatureToBlock.set(signature, id);
      }
      nextBlock.push(id);
    }

    const stable = new Set(nextBlock).size === new Set(block).size;
    block = nextBlock;
    if (stable) {
      break;
    }
  }

  const blockCount = new Set(block).size;
  const representatives = new Array<number>(blockCount).fill(-1);
  for (const state of dfa.states) {
    const id = block[state.id]!;
    if (representatives[id] === -1) {
      representatives[id] = state.id;
    }
  }

  const states: DfaState[] = [];
  for (let id = 0; id < blockCount; id += 1) {
    const source = dfa.states[representatives[id]!]!;
    const members = dfa.states.filter((state) => block[state.id] === id);
    states.push({
      id,
      accepting: source.accepting,
      transitions: source.transitions.map((target) =>
        target < 0 ? -1 : block[target]!,
      ),
      nfaStates: members.flatMap((state) => state.nfaStates),
    });
  }

  return new Dfa(states, dfa.alphabet, block[dfa.start]!);
}

function buildAlphabet(sets: readonly CharSet[]): CharClass[] {
  if (sets.length === 0) {
    return [];
  }

  const boundaries = new Set<number>([0, MAX_CODE_POINT + 1]);
  for (const set of sets) {
    for (const range of set.ranges) {
      boundaries.add(range.lo);
      boundaries.add(range.hi + 1);
    }
  }

  const points = [...boundaries].sort((a, b) => a - b);
  const bySignature = new Map<string, number>();
  const alphabet: CharClass[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const lo = points[i]!;
    const hi = points[i + 1]! - 1;
    if (lo > hi) {
      continue;
    }

    const signature = sets.map((set) => (set.contains(lo) ? '1' : '0')).join('');
    const existing = bySignature.get(signature);

    if (existing === undefined) {
      bySignature.set(signature, alphabet.length);
      alphabet.push({ set: CharSet.of([[lo, hi]]), representative: lo });
    } else {
      const cls = alphabet[existing]!;
      alphabet[existing] = {
        set: cls.set.union(CharSet.of([[lo, hi]])),
        representative: cls.representative,
      };
    }
  }

  return alphabet;
}

function epsilonClosure(seeds: Iterable<NfaState>): NfaState[] {
  const seen = new Set<NfaState>();
  const stack = [...seeds];

  while (stack.length > 0) {
    const state = stack.pop()!;
    if (seen.has(state)) {
      continue;
    }
    seen.add(state);
    for (const edge of state.edges) {
      if (edge.kind === 'epsilon') {
        stack.push(edge.to);
      }
    }
  }

  return [...seen].sort((a, b) => a.id - b.id);
}

function buildLookup(alphabet: readonly CharClass[]): LookupEntry[] {
  const entries: LookupEntry[] = [];
  alphabet.forEach((cls, index) => {
    for (const range of cls.set.ranges) {
      entries.push({ lo: range.lo, hi: range.hi, index });
    }
  });
  entries.sort((a, b) => a.lo - b.lo);
  return entries;
}

function escapeDot(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
