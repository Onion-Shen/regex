import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Regex } from '../src/regex.ts';

/** 可复现的伪随机数生成器。 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Generator {
  private readonly random: () => number;

  constructor(random: () => number) {
    this.random = random;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.random() * items.length)]!;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.random() * maxExclusive);
  }

  atom(): string {
    return this.pick(['a', 'b', 'c', '[ab]', '[a-c]', '[^ab]', '\\d', '.']);
  }

  /** 生成 JavaScript 与本引擎都支持的表达式（不含锚点、捕获、反向引用）。 */
  pattern(depth: number): string {
    if (depth <= 0) {
      return this.atom();
    }

    const roll = this.random();
    if (roll < 0.3) {
      return this.atom();
    }
    if (roll < 0.55) {
      return this.pattern(depth - 1) + this.pattern(depth - 1);
    }
    if (roll < 0.75) {
      return `(?:${this.pattern(depth - 1)}|${this.pattern(depth - 1)})`;
    }
    return `(?:${this.pattern(depth - 1)})${this.pick(['*', '+', '?', '{1,2}', '{0,3}'])}`;
  }

  /** 无分支的贪心表达式，用于对比最左匹配区间。 */
  simplePattern(depth: number): string {
    const parts: string[] = [];
    for (let i = 0; i < depth; i += 1) {
      parts.push(this.pick(['a', 'b', 'c', '[ab]', '[a-c]']));
      if (this.random() < 0.6) {
        parts.push(this.pick(['*', '+', '?', '{1,2}']));
      }
    }
    return parts.join('');
  }

  text(alphabet: string, maxLength: number): string {
    const length = this.int(maxLength + 1);
    let text = '';
    for (let i = 0; i < length; i += 1) {
      text += this.pick([...alphabet]);
    }
    return text;
  }
}

test('随机表达式与 JavaScript RegExp 的子串匹配对拍', () => {
  const random = mulberry32(0x5eed_2026);
  const generator = new Generator(random);
  const alphabet = 'abc12 \n';
  let checked = 0;

  for (let i = 0; i < 120; i += 1) {
    const pattern = generator.pattern(3);
    const regex = new Regex(pattern);
    const native = new RegExp(pattern);

    for (let j = 0; j < 12; j += 1) {
      const input = generator.text(alphabet, 8);
      assert.equal(
        regex.test(input),
        native.test(input),
        `pattern=${pattern} input=${JSON.stringify(input)}`,
      );
      checked += 1;
    }
  }

  assert.equal(checked, 1440);
});

test('随机表达式与 JavaScript RegExp 的整串匹配对拍', () => {
  const random = mulberry32(0xc0ffee);
  const generator = new Generator(random);
  const alphabet = 'abc12 ';

  for (let i = 0; i < 120; i += 1) {
    const pattern = generator.pattern(2);
    const regex = new Regex(pattern);
    const native = new RegExp(`^(?:${pattern})$`);

    for (let j = 0; j < 10; j += 1) {
      const input = generator.text(alphabet, 7);
      assert.equal(
        regex.testFull(input),
        native.test(input),
        `full pattern=${pattern} input=${JSON.stringify(input)}`,
      );
    }
  }
});

test('无分支贪心表达式与 JavaScript 的匹配区间对拍', () => {
  const random = mulberry32(0xabad1dea);
  const generator = new Generator(random);
  const alphabet = 'abc';

  for (let i = 0; i < 100; i += 1) {
    const pattern = generator.simplePattern(3);
    const regex = new Regex(pattern);
    const native = new RegExp(pattern, 'g');

    for (let j = 0; j < 8; j += 1) {
      const input = generator.text(alphabet, 7);

      const ours = regex.findAll(input).map((match) => [match.index, match.end]);
      const theirs: Array<[number, number]> = [];
      native.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = native.exec(input)) !== null) {
        theirs.push([match.index, match.index + match[0].length]);
        if (match[0].length === 0) {
          native.lastIndex += 1;
        }
      }

      assert.deepEqual(
        ours,
        theirs,
        `pattern=${pattern} input=${JSON.stringify(input)}`,
      );
    }
  }
});
