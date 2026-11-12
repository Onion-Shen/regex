import type { Assertion, Ast } from './ast.ts';
import { CharSet } from './charset.ts';
import { RegexCompileError } from './errors.ts';

export type Edge =
  | { readonly kind: 'epsilon'; readonly to: NfaState }
  | { readonly kind: 'charset'; readonly set: CharSet; readonly to: NfaState }
  | { readonly kind: 'assert'; readonly assertion: Assertion; readonly to: NfaState };

export class NfaState {
  readonly id: number;
  readonly edges: Edge[] = [];
  accepting = false;

  constructor(id: number) {
    this.id = id;
  }
}

export class Nfa {
  readonly start: NfaState;
  readonly accept: NfaState;
  readonly states: readonly NfaState[];
  readonly hasAssertions: boolean;
  readonly charSets: readonly CharSet[];

  constructor(
    start: NfaState,
    accept: NfaState,
    states: readonly NfaState[],
    hasAssertions: boolean,
    charSets: readonly CharSet[],
  ) {
    this.start = start;
    this.accept = accept;
    this.states = states;
    this.hasAssertions = hasAssertions;
    this.charSets = charSets;
  }

  get stateCount(): number {
    return this.states.length;
  }

  toDot(): string {
    const lines: string[] = [
      'digraph NFA {',
      '  rankdir=LR;',
      '  node [shape=circle, fontsize=10];',
      '  start [shape=point, width=0.1];',
      `  start -> q${this.start.id};`,
    ];

    for (const state of this.states) {
      if (state.accepting) {
        lines.push(`  q${state.id} [shape=doublecircle, peripheries=2];`);
      }
    }

    for (const state of this.states) {
      const byTarget = new Map<number, string[]>();
      for (const edge of state.edges) {
        const label =
          edge.kind === 'epsilon'
            ? 'ε'
            : edge.kind === 'assert'
              ? edge.assertion === 'start'
                ? '^'
                : '$'
              : edge.set.toString(24);
        const labels = byTarget.get(edge.to.id) ?? [];
        labels.push(label);
        byTarget.set(edge.to.id, labels);
      }

      for (const [target, labels] of byTarget) {
        lines.push(
          `  q${state.id} -> q${target} [label="${escapeDot(labels.join(', '))}"];`,
        );
      }
    }

    lines.push('}');
    return lines.join('\n');
  }
}

export interface NfaBuildOptions {
  /** 量词展开的安全上限，默认 1000。 */
  readonly maxRepeat?: number;
  /** 自动机状态数上限，默认 200000。 */
  readonly maxStates?: number;
}

const DEFAULT_MAX_REPEAT = 1000;
const DEFAULT_MAX_STATES = 200_000;

export function astToNfa(ast: Ast, options: NfaBuildOptions = {}): Nfa {
  return new Builder(options.maxRepeat ?? DEFAULT_MAX_REPEAT, options.maxStates ?? DEFAULT_MAX_STATES).build(ast);
}

interface Fragment {
  readonly start: NfaState;
  readonly accept: NfaState;
}

class Builder {
  private readonly maxRepeat: number;
  private readonly maxStates: number;
  private readonly states: NfaState[] = [];
  private readonly charSets: CharSet[] = [];
  private hasAssertions = false;

  constructor(maxRepeat: number, maxStates: number) {
    this.maxRepeat = maxRepeat;
    this.maxStates = maxStates;
  }

  build(ast: Ast): Nfa {
    const fragment = this.buildNode(ast);
    fragment.accept.accepting = true;
    return new Nfa(
      fragment.start,
      fragment.accept,
      this.states,
      this.hasAssertions,
      this.charSets,
    );
  }

  private newState(): NfaState {
    if (this.states.length >= this.maxStates) {
      throw new RegexCompileError(
        `自动机状态数超过上限 ${this.maxStates}，请降低量词上限或简化表达式`,
      );
    }
    const state = new NfaState(this.states.length);
    this.states.push(state);
    return state;
  }

  private emptyFragment(): Fragment {
    return this.epsilonFragment();
  }

  private epsilonFragment(): Fragment {
    const start = this.newState();
    const accept = this.newState();
    start.edges.push({ kind: 'epsilon', to: accept });
    return { start, accept };
  }

  private buildNode(node: Ast): Fragment {
    switch (node.kind) {
      case 'empty':
        return this.emptyFragment();

      case 'charset': {
        const start = this.newState();
        const accept = this.newState();
        start.edges.push({ kind: 'charset', set: node.set, to: accept });
        this.registerCharSet(node.set);
        return { start, accept };
      }

      case 'assert': {
        const start = this.newState();
        const accept = this.newState();
        start.edges.push({ kind: 'assert', assertion: node.assertion, to: accept });
        this.hasAssertions = true;
        return { start, accept };
      }

      case 'concat': {
        const fragments = node.parts.map((part) => this.buildNode(part));
        return this.concatFragments(fragments);
      }

      case 'alt': {
        const start = this.newState();
        const accept = this.newState();
        for (const option of node.options) {
          const fragment = this.buildNode(option);
          start.edges.push({ kind: 'epsilon', to: fragment.start });
          fragment.accept.edges.push({ kind: 'epsilon', to: accept });
        }
        return { start, accept };
      }

      case 'repeat':
        return this.buildRepeat(node.node, node.min, node.max);
    }
  }

  private buildRepeat(node: Ast, min: number, max: number | null): Fragment {
    const upperBound = max ?? min;
    if (min > this.maxRepeat || upperBound > this.maxRepeat) {
      throw new RegexCompileError(
        `量词展开次数超过上限 ${this.maxRepeat}（{${min},${max ?? '∞'}}）`,
      );
    }

    const fragments: Fragment[] = [];
    for (let i = 0; i < min; i += 1) {
      fragments.push(this.buildNode(node));
    }

    if (max === null) {
      fragments.push(this.buildStar(node));
    } else {
      const optionalCount = max - min;
      if (optionalCount > 0) {
        fragments.push(this.buildOptionalChain(node, optionalCount));
      }
    }

    return this.concatFragments(fragments);
  }

  /**
   * 构造 `(node (node ...)?)?` 形式的嵌套可选项。
   * 从内向外构造，避免递归深度随次数增长。
   */
  private buildOptionalChain(node: Ast, count: number): Fragment {
    let fragment = this.emptyFragment();

    for (let i = 0; i < count; i += 1) {
      const body = this.concatFragments([this.buildNode(node), fragment]);
      const start = this.newState();
      const accept = this.newState();
      start.edges.push({ kind: 'epsilon', to: body.start });
      start.edges.push({ kind: 'epsilon', to: accept });
      body.accept.edges.push({ kind: 'epsilon', to: accept });
      fragment = { start, accept };
    }

    return fragment;
  }

  private buildStar(node: Ast): Fragment {
    const body = this.buildNode(node);
    const start = this.newState();
    const accept = this.newState();

    start.edges.push({ kind: 'epsilon', to: body.start });
    start.edges.push({ kind: 'epsilon', to: accept });
    body.accept.edges.push({ kind: 'epsilon', to: body.start });
    body.accept.edges.push({ kind: 'epsilon', to: accept });

    return { start, accept };
  }

  private concatFragments(fragments: readonly Fragment[]): Fragment {
    if (fragments.length === 0) {
      return this.emptyFragment();
    }

    let result = fragments[0]!;
    for (let i = 1; i < fragments.length; i += 1) {
      const next = fragments[i]!;
      result.accept.edges.push({ kind: 'epsilon', to: next.start });
      result = { start: result.start, accept: next.accept };
    }
    return result;
  }

  private registerCharSet(set: CharSet): void {
    if (!this.charSets.some((existing) => existing.equals(set))) {
      this.charSets.push(set);
    }
  }
}

function escapeDot(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
