import { isLineTerminator } from './charset.ts';
import type { Assertion } from './ast.ts';
import type { Nfa, NfaState } from './nfa.ts';

export interface Match {
  /** UTF-16 下标。 */
  readonly index: number;
  /** 结束下标（不含）。 */
  readonly end: number;
  readonly value: string;
}

export interface MatchOptions {
  readonly multiline?: boolean;
}

/**
 * 找到 fromIndex 之后最左侧的匹配。
 *
 * 采用“最左最长”（POSIX 风格）：先确定最早的起始位置，
 * 再在该起点上取尽可能长的结束位置。这与 JavaScript 的
 * 最左优先（左交替优先）不同，例如 /a|ab/ 匹配 "ab" 时，
 * 本引擎返回 "ab"。
 */
export function find(
  nfa: Nfa,
  input: string,
  fromIndex = 0,
  options: MatchOptions = {},
): Match | null {
  if (typeof input !== 'string') {
    throw new TypeError('输入必须是字符串');
  }

  const multiline = options.multiline === true;
  const length = input.length;
  let pos = normalizeIndex(fromIndex, length);
  if (pos > length) {
    return null;
  }

  let active = new Map<NfaState, number>();
  let bestStart = -1;
  let bestEnd = -1;

  while (true) {
    if (bestStart < 0) {
      active = seed(nfa, active, pos, input, multiline);
    }

    for (const [state, start] of active) {
      if (!state.accepting) {
        continue;
      }
      if (bestStart < 0 || start < bestStart) {
        bestStart = start;
        bestEnd = pos;
      } else if (start === bestStart && pos > bestEnd) {
        bestEnd = pos;
      }
    }

    if (bestStart >= 0) {
      for (const [state, start] of active) {
        if (start > bestStart) {
          active.delete(state);
        }
      }

      let alive = false;
      for (const start of active.values()) {
        if (start <= bestStart) {
          alive = true;
          break;
        }
      }
      if (!alive) {
        break;
      }
    }

    if (pos >= length) {
      break;
    }

    const cp = input.codePointAt(pos)!;
    const width = cp > 0xffff ? 2 : 1;
    const next = new Map<NfaState, number>();

    for (const [state, start] of active) {
      for (const edge of state.edges) {
        if (edge.kind !== 'charset' || !edge.set.contains(cp)) {
          continue;
        }
        const known = next.get(edge.to);
        if (known === undefined || start < known) {
          next.set(edge.to, start);
        }
      }
    }

    pos += width;
    active = closure(next, pos, input, multiline);
  }

  if (bestStart < 0) {
    return null;
  }

  return {
    index: bestStart,
    end: bestEnd,
    value: input.slice(bestStart, bestEnd),
  };
}

/** 整串匹配（等价于 `^(?:pattern)$`，不做结尾换行特判）。 */
export function testFull(nfa: Nfa, input: string, options: MatchOptions = {}): boolean {
  if (typeof input !== 'string') {
    throw new TypeError('输入必须是字符串');
  }

  const multiline = options.multiline === true;
  const length = input.length;
  let pos = 0;
  let active = closure(new Map([[nfa.start, 0]]), 0, input, multiline);

  while (true) {
    if (pos === length) {
      for (const state of active.keys()) {
        if (state.accepting) {
          return true;
        }
      }
      return false;
    }

    const cp = input.codePointAt(pos)!;
    const width = cp > 0xffff ? 2 : 1;
    const next = new Map<NfaState, number>();

    for (const [state, start] of active) {
      for (const edge of state.edges) {
        if (edge.kind === 'charset' && edge.set.contains(cp)) {
          const known = next.get(edge.to);
          if (known === undefined || start < known) {
            next.set(edge.to, start);
          }
        }
      }
    }

    pos += width;
    active = closure(next, pos, input, multiline);
    if (active.size === 0) {
      return false;
    }
  }
}

export function findAll(nfa: Nfa, input: string, options: MatchOptions = {}): Match[] {
  const result: Match[] = [];
  for (const match of iterateMatches(nfa, input, options)) {
    result.push(match);
  }
  return result;
}

export type Replacement = string | ((match: Match) => string);

export function replace(
  nfa: Nfa,
  input: string,
  replacement: Replacement,
  options: MatchOptions = {},
): string {
  if (typeof input !== 'string') {
    throw new TypeError('输入必须是字符串');
  }

  let output = '';
  let last = 0;

  for (const match of iterateMatches(nfa, input, options)) {
    output += input.slice(last, match.index);
    output +=
      typeof replacement === 'function'
        ? replacement(match)
        : expandReplacement(replacement, match);
    last = match.end;
  }

  return output + input.slice(last);
}

function* iterateMatches(
  nfa: Nfa,
  input: string,
  options: MatchOptions,
): Generator<Match> {
  let cursor = 0;

  while (cursor <= input.length) {
    const match = find(nfa, input, cursor, options);
    if (match === null) {
      return;
    }

    yield match;

    if (match.end > match.index) {
      cursor = match.end;
    } else {
      if (match.end >= input.length) {
        return;
      }
      const cp = input.codePointAt(match.end)!;
      cursor = match.end + (cp > 0xffff ? 2 : 1);
    }
  }
}

function expandReplacement(template: string, match: Match): string {
  let output = '';

  for (let i = 0; i < template.length; i += 1) {
    const ch = template[i]!;
    if (ch !== '$') {
      output += ch;
      continue;
    }

    const next = template[i + 1];
    if (next === '$') {
      output += '$';
      i += 1;
    } else if (next === '&') {
      output += match.value;
      i += 1;
    } else {
      output += '$';
    }
  }

  return output;
}

function seed(
  nfa: Nfa,
  active: Map<NfaState, number>,
  pos: number,
  input: string,
  multiline: boolean,
): Map<NfaState, number> {
  const seeds = new Map(active);
  const known = seeds.get(nfa.start);
  if (known === undefined || pos < known) {
    seeds.set(nfa.start, pos);
  }
  return closure(seeds, pos, input, multiline);
}

function closure(
  seeds: Map<NfaState, number>,
  pos: number,
  input: string,
  multiline: boolean,
): Map<NfaState, number> {
  const result = new Map<NfaState, number>();
  const stack: Array<[NfaState, number]> = [...seeds];

  while (stack.length > 0) {
    const [state, start] = stack.pop()!;
    const known = result.get(state);
    if (known !== undefined && known <= start) {
      continue;
    }

    result.set(state, start);

    for (const edge of state.edges) {
      if (edge.kind === 'epsilon') {
        stack.push([edge.to, start]);
      } else if (
        edge.kind === 'assert' &&
        assertionHolds(edge.assertion, input, pos, multiline)
      ) {
        stack.push([edge.to, start]);
      }
    }
  }

  return result;
}

function assertionHolds(
  assertion: Assertion,
  input: string,
  pos: number,
  multiline: boolean,
): boolean {
  const length = input.length;

  if (assertion === 'start') {
    if (pos === 0) {
      return true;
    }
    return multiline && isLineTerminator(input.charCodeAt(pos - 1));
  }

  if (pos === length) {
    return true;
  }
  if (multiline) {
    return isLineTerminator(input.charCodeAt(pos));
  }
  return pos + 1 === length && isLineTerminator(input.charCodeAt(pos));
}

function normalizeIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) {
    return 0;
  }
  return Math.min(Math.max(0, Math.trunc(index)), length + 1);
}
