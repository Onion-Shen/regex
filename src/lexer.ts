import type { Assertion } from './ast.ts';
import { CharSet, codePointSetOf, singleCodePointOf } from './charset.ts';
import { RegexSyntaxError } from './errors.ts';

export interface LexOptions {
  readonly ignoreCase?: boolean;
  readonly dotAll?: boolean;
}

export type Token =
  | { readonly kind: 'charset'; readonly set: CharSet; readonly raw: string; readonly pos: number }
  | { readonly kind: 'assert'; readonly assertion: Assertion; readonly raw: string; readonly pos: number }
  | { readonly kind: 'repeat'; readonly min: number; readonly max: number | null; readonly raw: string; readonly pos: number }
  | {
      readonly kind: 'alt' | 'lparen' | 'rparen' | 'star' | 'plus' | 'question' | 'eof';
      readonly raw: string;
      readonly pos: number;
    };

const MAX_QUANTIFIER = 1_000_000;

export function isQuantifierToken(token: Token): boolean {
  return (
    token.kind === 'star' ||
    token.kind === 'plus' ||
    token.kind === 'question' ||
    token.kind === 'repeat'
  );
}

export function tokenize(pattern: string, options: LexOptions = {}): Token[] {
  if (typeof pattern !== 'string') {
    throw new TypeError('正则表达式必须是字符串');
  }
  return new Lexer(pattern, options.ignoreCase === true, options.dotAll === true).tokenize();
}

interface ClassAtom {
  readonly set: CharSet;
  readonly codePoint?: number;
}

class Lexer {
  private readonly source: string;
  private readonly ignoreCase: boolean;
  private readonly dotAll: boolean;
  private index = 0;

  constructor(source: string, ignoreCase: boolean, dotAll: boolean) {
    this.source = source;
    this.ignoreCase = ignoreCase;
    this.dotAll = dotAll;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.index < this.source.length) {
      tokens.push(this.readToken());
    }

    tokens.push({ kind: 'eof', raw: '', pos: this.index });
    return tokens;
  }

  private readToken(): Token {
    const pos = this.index;
    const ch = this.peek();
    if (ch === undefined) {
      return { kind: 'eof', raw: '', pos };
    }

    switch (ch) {
      case '\\': {
        const set = this.readEscape(false);
        const tokenSet = this.ignoreCase ? set.caseFold() : set;
        return { kind: 'charset', set: tokenSet, raw: this.source.slice(pos, this.index), pos };
      }
      case '[':
        return this.readCharacterClass(pos);
      case '(': {
        this.advance();
        if (this.peek() === '?') {
          this.advance();
          const modifier = this.peek();
          if (modifier === ':') {
            this.advance();
          } else if (modifier === '=' || modifier === '!') {
            this.fail('暂不支持前瞻/后顾断言', pos);
          } else {
            this.fail('暂不支持命名分组、内联标志或其他 (?...) 语法', pos);
          }
        }
        return { kind: 'lparen', raw: this.source.slice(pos, this.index), pos };
      }
      case ')': {
        this.advance();
        return { kind: 'rparen', raw: ')', pos };
      }
      case '|': {
        this.advance();
        return { kind: 'alt', raw: '|', pos };
      }
      case '*': {
        this.advance();
        return { kind: 'star', raw: '*', pos };
      }
      case '+': {
        this.advance();
        return { kind: 'plus', raw: '+', pos };
      }
      case '?': {
        this.advance();
        return { kind: 'question', raw: '?', pos };
      }
      case '{': {
        const repeat = this.tryReadRepeat(pos);
        if (repeat !== null) {
          return repeat;
        }
        this.advance();
        return this.literalToken('{', pos);
      }
      case '.': {
        this.advance();
        const set = this.dotAll ? CharSet.ALL : CharSet.DOT;
        return { kind: 'charset', set, raw: '.', pos };
      }
      case '^': {
        this.advance();
        return { kind: 'assert', assertion: 'start', raw: '^', pos };
      }
      case '$': {
        this.advance();
        return { kind: 'assert', assertion: 'end', raw: '$', pos };
      }
      default: {
        this.advance();
        return this.literalToken(ch, pos);
      }
    }
  }

  private literalToken(ch: string, pos: number): Token {
    const set = codePointSetOf(ch);
    const tokenSet = this.ignoreCase ? set.caseFold() : set;
    return { kind: 'charset', set: tokenSet, raw: ch, pos };
  }

  private readCharacterClass(pos: number): Token {
    this.advance(); // '['
    let negated = false;

    if (this.peek() === '^') {
      this.advance();
      negated = true;
    }

    let set = CharSet.EMPTY;
    let closed = false;

    while (this.index < this.source.length) {
      if (this.peek() === ']') {
        this.advance();
        closed = true;
        break;
      }

      const atom = this.readClassAtom();
      const dash = this.peek();
      const afterDash = this.peekUnit(1);

      if (atom.codePoint !== undefined && dash === '-' && afterDash !== undefined && afterDash !== ']') {
        this.advance(); // '-'
        const right = this.readClassAtom();
        if (right.codePoint === undefined) {
          this.fail('字符类范围的端点必须是单个字符', pos);
        }
        if (right.codePoint < atom.codePoint) {
          this.fail('字符类范围顺序颠倒', pos);
        }
        set = set.union(CharSet.of([[atom.codePoint, right.codePoint]]));
      } else {
        if (atom.codePoint === undefined && dash === '-' && afterDash !== undefined && afterDash !== ']') {
          this.fail('字符类范围的端点不能是预定义字符类', pos);
        }
        set = set.union(atom.set);
      }
    }

    if (!closed) {
      this.fail('字符类缺少右侧的 ]', pos);
    }

    if (this.ignoreCase) {
      set = set.caseFold();
    }
    if (negated) {
      set = set.complement();
    }

    return {
      kind: 'charset',
      set,
      raw: this.source.slice(pos, this.index),
      pos,
    };
  }

  private readClassAtom(): ClassAtom {
    if (this.peek() === '\\') {
      const set = this.readEscape(true);
      const codePoint = singleCodePointOf(set);
      return codePoint === undefined ? { set } : { set, codePoint };
    }

    const ch = this.advance();
    if (ch === undefined) {
      this.fail('字符类意外结束', this.index);
    }
    return { set: codePointSetOf(ch), codePoint: ch.codePointAt(0)! };
  }

  private readEscape(inClass: boolean): CharSet {
    const start = this.index;
    this.advance(); // '\\'

    const ch = this.advance();
    if (ch === undefined) {
      this.fail('转义符 \\ 后意外结束', start);
    }

    switch (ch) {
      case 'd':
        return CharSet.DIGIT;
      case 'D':
        return CharSet.DIGIT.complement();
      case 'w':
        return CharSet.WORD;
      case 'W':
        return CharSet.WORD.complement();
      case 's':
        return CharSet.SPACE;
      case 'S':
        return CharSet.SPACE.complement();
      case 'n':
        return CharSet.single(0x0a);
      case 'r':
        return CharSet.single(0x0d);
      case 't':
        return CharSet.single(0x09);
      case 'f':
        return CharSet.single(0x0c);
      case 'v':
        return CharSet.single(0x0b);
      case '0': {
        if (this.isDigit(this.peek())) {
          this.fail('暂不支持八进制转义', start);
        }
        return CharSet.single(0);
      }
      case 'x':
        return CharSet.single(this.readHex(2, start));
      case 'u': {
        if (this.peek() === '{') {
          this.advance();
          return CharSet.single(this.readCodePointEscape(start));
        }
        return CharSet.single(this.readHex(4, start));
      }
      case 'b':
        if (inClass) {
          return CharSet.single(0x08);
        }
        this.fail('暂不支持 \\b 单词边界断言', start);
        break;
      case 'B':
        this.fail('暂不支持 \\B 非单词边界断言', start);
        break;
      case 'p':
      case 'P':
        this.fail('暂不支持 Unicode 属性转义', start);
        break;
      case 'k':
        this.fail('暂不支持命名反向引用', start);
        break;
      default:
        break;
    }

    if (this.isDigit(ch)) {
      this.fail('暂不支持反向引用', start);
    }
    if (this.isAsciiLetter(ch)) {
      this.fail(`未知的转义序列 \\${ch}`, start);
    }

    return codePointSetOf(ch);
  }

  private readHex(count: number, start: number): number {
    let value = 0;
    for (let i = 0; i < count; i += 1) {
      const ch = this.peekUnit(0);
      if (ch === undefined || !isHexDigit(ch)) {
        this.fail(`\\x/\\u 转义需要 ${count} 位十六进制数字`, start);
      }
      value = value * 16 + Number.parseInt(ch, 16);
      this.advance();
    }
    return value;
  }

  private readCodePointEscape(start: number): number {
    let digits = '';
    while (this.index < this.source.length && this.peek() !== '}') {
      const ch = this.peekUnit(0)!;
      if (!isHexDigit(ch)) {
        this.fail('\\u{...} 中包含非法字符', start);
      }
      digits += ch;
      this.advance();
    }

    if (this.peek() !== '}' || digits.length === 0 || digits.length > 6) {
      this.fail('非法的 \\u{...} 转义', start);
    }
    this.advance(); // '}'

    const value = Number.parseInt(digits, 16);
    if (value > 0x10ffff) {
      this.fail('码点超出 Unicode 范围', start);
    }
    return value;
  }

  private tryReadRepeat(start: number): Token | null {
    let cursor = this.index + 1;
    const before = this.readDigitsAt(cursor);
    cursor = before.end;

    let min: number;
    let max: number | null;

    if (this.source[cursor] === '}') {
      if (before.text.length === 0) {
        return null;
      }
      min = this.parseQuantifierNumber(before.text, start);
      max = min;
      this.index = cursor + 1;
    } else if (this.source[cursor] === ',') {
      cursor += 1;
      const after = this.readDigitsAt(cursor);
      if (this.source[after.end] !== '}') {
        return null;
      }
      if (before.text.length === 0 && after.text.length === 0) {
        return null;
      }
      min = before.text.length === 0 ? 0 : this.parseQuantifierNumber(before.text, start);
      max = after.text.length === 0 ? null : this.parseQuantifierNumber(after.text, start);
      if (max !== null && max < min) {
        this.fail('量词下限不能大于上限', start);
      }
      this.index = after.end + 1;
    } else {
      return null;
    }

    return {
      kind: 'repeat',
      min,
      max,
      raw: this.source.slice(start, this.index),
      pos: start,
    };
  }

  private readDigitsAt(from: number): { text: string; end: number } {
    let end = from;
    while (end < this.source.length) {
      const ch = this.source[end]!;
      if (ch < '0' || ch > '9') {
        break;
      }
      end += 1;
    }
    return { text: this.source.slice(from, end), end };
  }

  private parseQuantifierNumber(text: string, pos: number): number {
    const value = Number.parseInt(text, 10);
    if (!Number.isSafeInteger(value) || value > MAX_QUANTIFIER) {
      this.fail(`量词上限过大（最大 ${MAX_QUANTIFIER}）`, pos);
    }
    return value;
  }

  private peek(): string | undefined {
    const cp = this.source.codePointAt(this.index);
    return cp === undefined ? undefined : String.fromCodePoint(cp);
  }

  private peekUnit(offset: number): string | undefined {
    return this.source[this.index + offset];
  }

  private advance(): string | undefined {
    if (this.index >= this.source.length) {
      return undefined;
    }
    const cp = this.source.codePointAt(this.index)!;
    const ch = String.fromCodePoint(cp);
    this.index += ch.length;
    return ch;
  }

  private isDigit(ch: string | undefined): boolean {
    return ch !== undefined && ch >= '0' && ch <= '9';
  }

  private isAsciiLetter(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  }

  private fail(message: string, pos: number): never {
    throw new RegexSyntaxError(message, this.source, pos);
  }
}

function isHexDigit(ch: string): boolean {
  return (
    (ch >= '0' && ch <= '9') ||
    (ch >= 'a' && ch <= 'f') ||
    (ch >= 'A' && ch <= 'F')
  );
}
