import {
  alternation,
  assertion,
  concat,
  repeat,
  type Ast,
} from './ast.ts';
import { isQuantifierToken, tokenize, type Token } from './lexer.ts';
import { RegexSyntaxError } from './errors.ts';

export interface ParseOptions {
  readonly ignoreCase?: boolean;
  readonly dotAll?: boolean;
}

export interface ParseResult {
  readonly ast: Ast;
  readonly tokens: readonly Token[];
}

export function parsePattern(pattern: string, options: ParseOptions = {}): ParseResult {
  const tokens = tokenize(pattern, options);
  const ast = new Parser(pattern, tokens).parse();
  return { ast, tokens };
}

/**
 * 递归下降文法（优先级从低到高）：
 *
 *   alternation := concat ('|' concat)*
 *   concat      := repeat*
 *   repeat      := atom ('*' | '+' | '?' | '{m,n}')?
 *   atom        := charset | '^' | '$' | '(' alternation ')'
 */
class Parser {
  private readonly source: string;
  private readonly tokens: readonly Token[];
  private index = 0;

  constructor(source: string, tokens: readonly Token[]) {
    this.source = source;
    this.tokens = tokens;
  }

  parse(): Ast {
    const ast = this.parseAlternation();
    const token = this.current();

    if (token.kind === 'rparen') {
      this.fail('多余的右括号 )', token);
    }
    if (isQuantifierToken(token)) {
      this.fail('量词前面没有可重复的表达式', token);
    }
    if (token.kind !== 'eof') {
      this.fail('无法解析的记号', token);
    }

    return ast;
  }

  private parseAlternation(): Ast {
    const options: Ast[] = [this.parseConcat()];

    while (this.current().kind === 'alt') {
      this.advance();
      options.push(this.parseConcat());
    }

    return alternation(options);
  }

  private parseConcat(): Ast {
    const parts: Ast[] = [];

    while (true) {
      const token = this.current();

      if (token.kind === 'charset') {
        this.advance();
        parts.push(this.parseQuantifier({ kind: 'charset', set: token.set }));
        continue;
      }

      if (token.kind === 'assert') {
        this.advance();
        parts.push(this.parseQuantifier(assertion(token.assertion)));
        continue;
      }

      if (token.kind === 'lparen') {
        const open = this.advance();
        const inner = this.parseAlternation();
        const close = this.current();
        if (close.kind !== 'rparen') {
          this.fail('缺少右括号 )', { ...open });
        }
        this.advance();
        parts.push(this.parseQuantifier(inner));
        continue;
      }

      break;
    }

    return concat(parts);
  }

  private parseQuantifier(atom: Ast): Ast {
    const token = this.current();
    if (!isQuantifierToken(token)) {
      return atom;
    }

    if (atom.kind === 'assert') {
      this.fail('锚点不能被量词修饰', token);
    }

    let min: number;
    let max: number | null;

    switch (token.kind) {
      case 'star':
        min = 0;
        max = null;
        break;
      case 'plus':
        min = 1;
        max = null;
        break;
      case 'question':
        min = 0;
        max = 1;
        break;
      case 'repeat':
        min = token.min;
        max = token.max;
        break;
      default:
        min = 1;
        max = 1;
    }

    this.advance();

    const next = this.current();
    if (isQuantifierToken(next)) {
      this.fail('量词不能连续出现（请使用分组，例如 (a*)?）', next);
    }

    return repeat(atom, min, max);
  }

  private current(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1]!;
  }

  private advance(): Token {
    const token = this.current();
    if (this.index < this.tokens.length - 1) {
      this.index += 1;
    }
    return token;
  }

  private fail(message: string, token: Token): never {
    throw new RegexSyntaxError(message, this.source, token.pos);
  }
}
