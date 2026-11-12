/**
 * 码点区间集合（Character Set）。
 *
 * 自动机里的每条字符边、以及 DFA 的字母表都由 CharSet 表示。
 * 所有区间在构造时被排序、合并，因此 contains 可以用二分查找。
 */

export const MAX_CODE_POINT = 0x10ffff;

export interface CharRange {
  readonly lo: number;
  readonly hi: number;
}

function assertRange(lo: number, hi: number): void {
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
    throw new RangeError(`字符区间必须是整数: ${lo}-${hi}`);
  }
  if (lo < 0 || hi > MAX_CODE_POINT || lo > hi) {
    throw new RangeError(`非法字符区间: ${lo}-${hi}`);
  }
}

function normalize(ranges: readonly CharRange[]): CharRange[] {
  const sorted = [...ranges].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const merged: CharRange[] = [];

  for (const range of sorted) {
    assertRange(range.lo, range.hi);
    const last = merged[merged.length - 1];
    if (last !== undefined && range.lo <= last.hi + 1) {
      if (range.hi > last.hi) {
        merged[merged.length - 1] = { lo: last.lo, hi: range.hi };
      }
    } else {
      merged.push({ lo: range.lo, hi: range.hi });
    }
  }

  return merged;
}

function singleCodePoint(set: CharSet): number | undefined {
  if (set.ranges.length !== 1) {
    return undefined;
  }
  const range = set.ranges[0]!;
  return range.lo === range.hi ? range.lo : undefined;
}

function simpleCaseVariants(cp: number): number[] {
  const ch = String.fromCodePoint(cp);
  const variants: number[] = [];
  for (const folded of [ch.toLowerCase(), ch.toUpperCase()]) {
    const parts = Array.from(folded);
    if (parts.length === 1) {
      const value = parts[0]!.codePointAt(0)!;
      if (!variants.includes(value)) {
        variants.push(value);
      }
    }
  }
  return variants;
}

/**
 * 不可变的码点集合。构造后 ranges 有序且互不相邻。
 */
export class CharSet {
  readonly ranges: readonly CharRange[];

  private constructor(ranges: readonly CharRange[]) {
    this.ranges = normalize(ranges);
  }

  static of(ranges: ReadonlyArray<readonly [number, number]>): CharSet {
    return new CharSet(ranges.map(([lo, hi]) => ({ lo, hi })));
  }

  static single(ch: string | number): CharSet {
    const cp = typeof ch === 'number' ? ch : ch.codePointAt(0);
    if (cp === undefined) {
      throw new TypeError('CharSet.single 需要非空字符串');
    }
    return new CharSet([{ lo: cp, hi: cp }]);
  }

  static ofString(text: string): CharSet {
    const ranges: CharRange[] = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      ranges.push({ lo: cp, hi: cp });
    }
    return new CharSet(ranges);
  }

  get isEmpty(): boolean {
    return this.ranges.length === 0;
  }

  get isAll(): boolean {
    return (
      this.ranges.length === 1 &&
      this.ranges[0]!.lo === 0 &&
      this.ranges[0]!.hi === MAX_CODE_POINT
    );
  }

  contains(cp: number): boolean {
    let low = 0;
    let high = this.ranges.length - 1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const range = this.ranges[mid]!;
      if (cp < range.lo) {
        high = mid - 1;
      } else if (cp > range.hi) {
        low = mid + 1;
      } else {
        return true;
      }
    }

    return false;
  }

  union(other: CharSet): CharSet {
    if (other.isEmpty) return this;
    if (this.isEmpty) return other;
    return new CharSet([...this.ranges, ...other.ranges]);
  }

  intersect(other: CharSet): CharSet {
    const result: CharRange[] = [];
    let i = 0;
    let j = 0;

    while (i < this.ranges.length && j < other.ranges.length) {
      const left = this.ranges[i]!;
      const right = other.ranges[j]!;
      const lo = Math.max(left.lo, right.lo);
      const hi = Math.min(left.hi, right.hi);

      if (lo <= hi) {
        result.push({ lo, hi });
      }
      if (left.hi < right.hi) {
        i += 1;
      } else {
        j += 1;
      }
    }

    return new CharSet(result);
  }

  complement(): CharSet {
    const result: CharRange[] = [];
    let next = 0;

    for (const range of this.ranges) {
      if (next < range.lo) {
        result.push({ lo: next, hi: range.lo - 1 });
      }
      next = range.hi + 1;
    }

    if (next <= MAX_CODE_POINT) {
      result.push({ lo: next, hi: MAX_CODE_POINT });
    }

    return new CharSet(result);
  }

  /**
   * 大小写闭包：把集合内每个字符的大写/小写形式也加入集合。
   *
   * 超大区间（例如 `.` 或取反字符类）本身已覆盖绝大部分字母，跳过逐点展开，
   * 避免构造 `[^a]` 时遍历一百多万个码点。取反操作在调用 caseFold 之后执行，
   * 因此 `[^a]` 的大小写语义是正确的。
   */
  caseFold(): CharSet {
    const additions: CharRange[] = [];
    const expansionLimit = 4096;

    for (const { lo, hi } of this.ranges) {
      if (hi - lo > expansionLimit) {
        continue;
      }
      for (let cp = lo; cp <= hi; cp += 1) {
        for (const variant of simpleCaseVariants(cp)) {
          if (variant !== cp) {
            additions.push({ lo: variant, hi: variant });
          }
        }
      }
    }

    return additions.length === 0 ? this : new CharSet([...this.ranges, ...additions]);
  }

  equals(other: CharSet): boolean {
    if (this.ranges.length !== other.ranges.length) {
      return false;
    }
    for (let i = 0; i < this.ranges.length; i += 1) {
      const a = this.ranges[i]!;
      const b = other.ranges[i]!;
      if (a.lo !== b.lo || a.hi !== b.hi) {
        return false;
      }
    }
    return true;
  }

  toString(maxLength = 48): string {
    if (this.isEmpty) {
      return '∅';
    }
    if (this.isAll) {
      return 'Σ';
    }

    let text = '';
    for (const range of this.ranges) {
      const piece = describeRange(range);
      if (text.length + piece.length + 1 > maxLength) {
        return `${text}…`;
      }
      if (text.length > 0) {
        text += ' ';
      }
      text += piece;
    }
    return `[${text}]`;
  }

  static readonly EMPTY = new CharSet([]);
  static readonly ALL = new CharSet([{ lo: 0, hi: MAX_CODE_POINT }]);
  static readonly DOT = new CharSet([
    { lo: 0, hi: 9 },
    { lo: 11, hi: MAX_CODE_POINT },
  ]);
  static readonly DIGIT = new CharSet([{ lo: 0x30, hi: 0x39 }]);
  static readonly WORD = new CharSet([
    { lo: 0x30, hi: 0x39 },
    { lo: 0x41, hi: 0x5a },
    { lo: 0x5f, hi: 0x5f },
    { lo: 0x61, hi: 0x7a },
  ]);
  static readonly SPACE = new CharSet([
    { lo: 0x09, hi: 0x0d },
    { lo: 0x20, hi: 0x20 },
    { lo: 0xa0, hi: 0xa0 },
    { lo: 0x1680, hi: 0x1680 },
    { lo: 0x2000, hi: 0x200a },
    { lo: 0x2028, hi: 0x2029 },
    { lo: 0x202f, hi: 0x202f },
    { lo: 0x205f, hi: 0x205f },
    { lo: 0x3000, hi: 0x3000 },
    { lo: 0xfeff, hi: 0xfeff },
  ]);
}

export function codePointSetOf(ch: string): CharSet {
  return CharSet.single(ch);
}

export function singleCodePointOf(set: CharSet): number | undefined {
  return singleCodePoint(set);
}

export function isLineTerminator(cp: number): boolean {
  return cp === 0x0a || cp === 0x0d || cp === 0x2028 || cp === 0x2029;
}

function describeRange(range: CharRange): string {
  if (range.lo === range.hi) {
    return escapeCodePoint(range.lo);
  }
  if (range.hi === range.lo + 1) {
    return escapeCodePoint(range.lo) + escapeCodePoint(range.hi);
  }
  return `${escapeCodePoint(range.lo)}-${escapeCodePoint(range.hi)}`;
}

const CONTROL_ESCAPES: Readonly<Record<number, string>> = {
  0x00: '\\0',
  0x09: '\\t',
  0x0a: '\\n',
  0x0b: '\\v',
  0x0c: '\\f',
  0x0d: '\\r',
};

export function escapeCodePoint(cp: number): string {
  const control = CONTROL_ESCAPES[cp];
  if (control !== undefined) {
    return control;
  }
  if (cp === 0x5c) {
    return '\\\\';
  }
  if (cp >= 0x20 && cp <= 0x7e) {
    return String.fromCodePoint(cp);
  }
  if (cp <= 0xff) {
    return `\\x${cp.toString(16).padStart(2, '0')}`;
  }
  if (cp <= 0xffff) {
    return `\\u${cp.toString(16).padStart(4, '0')}`;
  }
  return `\\u{${cp.toString(16)}}`;
}
