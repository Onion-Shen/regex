export { Regex, compile } from './regex.ts';
export type { RegexOptions } from './regex.ts';

export { parsePattern } from './parser.ts';
export type { ParseOptions, ParseResult } from './parser.ts';

export { tokenize, isQuantifierToken } from './lexer.ts';
export type { LexOptions, Token } from './lexer.ts';

export { CharSet, MAX_CODE_POINT, escapeCodePoint, isLineTerminator } from './charset.ts';
export type { CharRange } from './charset.ts';

export { EMPTY, formatAst } from './ast.ts';
export type {
  AlternationNode,
  Assertion,
  AssertionNode,
  Ast,
  CharSetNode,
  ConcatNode,
  EmptyNode,
  RepeatNode,
} from './ast.ts';

export { Nfa, NfaState, astToNfa } from './nfa.ts';
export type { Edge, NfaBuildOptions } from './nfa.ts';

export { Dfa, determinize, minimizeDfa } from './dfa.ts';
export type { CharClass, DfaState } from './dfa.ts';

export { find, findAll, replace, testFull } from './matcher.ts';
export type { Match, MatchOptions, Replacement } from './matcher.ts';

export { astToMermaid, dfaToMermaid, nfaToMermaid, toHtml, toMarkdown } from './visualize.ts';
export type { VisualFormat, VisualizeOptions } from './visualize.ts';

export { RegexCompileError, RegexSyntaxError } from './errors.ts';
