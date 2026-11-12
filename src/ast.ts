import type { CharSet } from './charset.ts';

export type Assertion = 'start' | 'end';

export interface EmptyNode {
  readonly kind: 'empty';
}

export interface CharSetNode {
  readonly kind: 'charset';
  readonly set: CharSet;
}

export interface ConcatNode {
  readonly kind: 'concat';
  readonly parts: readonly Ast[];
}

export interface AlternationNode {
  readonly kind: 'alt';
  readonly options: readonly Ast[];
}

export interface RepeatNode {
  readonly kind: 'repeat';
  readonly node: Ast;
  readonly min: number;
  readonly max: number | null;
}

export interface AssertionNode {
  readonly kind: 'assert';
  readonly assertion: Assertion;
}

export type Ast =
  | EmptyNode
  | CharSetNode
  | ConcatNode
  | AlternationNode
  | RepeatNode
  | AssertionNode;

/** 空串 ε。 */
export const EMPTY: Ast = { kind: 'empty' };

export function concat(parts: readonly Ast[]): Ast {
  const flat: Ast[] = [];
  for (const part of parts) {
    if (part.kind === 'empty') {
      continue;
    }
    if (part.kind === 'concat') {
      flat.push(...part.parts);
    } else {
      flat.push(part);
    }
  }

  if (flat.length === 0) {
    return EMPTY;
  }
  if (flat.length === 1) {
    return flat[0]!;
  }
  return { kind: 'concat', parts: flat };
}

export function alternation(options: readonly Ast[]): Ast {
  const flat: Ast[] = [];
  for (const option of options) {
    if (option.kind === 'alt') {
      flat.push(...option.options);
    } else {
      flat.push(option);
    }
  }

  if (flat.length === 0) {
    return EMPTY;
  }
  if (flat.length === 1) {
    return flat[0]!;
  }
  return { kind: 'alt', options: flat };
}

export function repeat(node: Ast, min: number, max: number | null): Ast {
  if (max === 0 || node.kind === 'empty') {
    return EMPTY;
  }
  if (min === 1 && max === 1) {
    return node;
  }
  return { kind: 'repeat', node, min, max };
}

export function assertion(kind: Assertion): Ast {
  return { kind: 'assert', assertion: kind };
}

/** 把 AST 渲染成缩进文本，供 CLI / 文档展示。 */
export function formatAst(ast: Ast): string {
  const lines: string[] = [];
  render(ast, 0, lines);
  return lines.join('\n');
}

function render(ast: Ast, depth: number, lines: string[]): void {
  const pad = '  '.repeat(depth);

  switch (ast.kind) {
    case 'empty':
      lines.push(`${pad}ε`);
      return;
    case 'charset':
      lines.push(`${pad}${ast.set}`);
      return;
    case 'assert':
      lines.push(`${pad}${ast.assertion === 'start' ? '^' : '$'}`);
      return;
    case 'concat':
      lines.push(`${pad}concat`);
      for (const part of ast.parts) {
        render(part, depth + 1, lines);
      }
      return;
    case 'alt':
      lines.push(`${pad}alt`);
      for (const option of ast.options) {
        render(option, depth + 1, lines);
      }
      return;
    case 'repeat': {
      const suffix =
        ast.max === null
          ? `{${ast.min},}`
          : ast.min === ast.max
            ? `{${ast.min}}`
            : `{${ast.min},${ast.max}}`;
      lines.push(`${pad}repeat ${suffix}`);
      render(ast.node, depth + 1, lines);
      return;
    }
  }
}
