import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAst, type Ast } from '../src/ast.ts';
import { RegexSyntaxError } from '../src/errors.ts';
import { parsePattern, type ParseOptions } from '../src/parser.ts';

function ast(pattern: string, options?: ParseOptions): Ast {
  return parsePattern(pattern, options).ast;
}

function shape(pattern: string, options?: ParseOptions): string {
  return formatAst(ast(pattern, options));
}

test('隐式连接与优先级：并 < 连接 < 重复', () => {
  assert.equal(
    shape('a|bc*'),
    ['alt', '  [a]', '  concat', '    [b]', '    repeat {0,}', '      [c]'].join('\n'),
  );

  assert.equal(
    shape('a(b|c)*'),
    [
      'concat',
      '  [a]',
      '  repeat {0,}',
      '    alt',
      '      [b]',
      '      [c]',
    ].join('\n'),
  );
});

test('分组、非捕获分组与嵌套', () => {
  assert.equal(
    shape('(?:ab)+'),
    ['repeat {1,}', '  concat', '    [a]', '    [b]'].join('\n'),
  );

  assert.equal(shape('(a)'), '[a]');
  assert.equal(shape('()'), 'ε');
  assert.equal(shape('(a|b)(c|d)'), [
    'concat',
    '  alt',
    '    [a]',
    '    [b]',
    '  alt',
    '    [c]',
    '    [d]',
  ].join('\n'));
});

test('空表达式与空分支', () => {
  assert.equal(shape(''), 'ε');
  assert.equal(shape('a|'), ['alt', '  [a]', '  ε'].join('\n'));
  assert.equal(shape('|a'), ['alt', '  ε', '  [a]'].join('\n'));
  assert.equal(shape('a||b'), ['alt', '  [a]', '  ε', '  [b]'].join('\n'));
});

test('量词上限、下限与精确次数', () => {
  assert.equal(shape('a{2,4}'), ['repeat {2,4}', '  [a]'].join('\n'));
  assert.equal(shape('a{2}'), ['repeat {2}', '  [a]'].join('\n'));
  assert.equal(shape('a{2,}'), ['repeat {2,}', '  [a]'].join('\n'));
  assert.equal(shape('a?'), ['repeat {0,1}', '  [a]'].join('\n'));
  assert.equal(shape('a{0}'), 'ε');

  const repeated = ast('a{2,4}');
  assert.equal(repeated.kind, 'repeat');
  if (repeated.kind === 'repeat') {
    assert.equal(repeated.min, 2);
    assert.equal(repeated.max, 4);
  }
});

test('锚点节点', () => {
  assert.equal(shape('^a$'), ['concat', '  ^', '  [a]', '  $'].join('\n'));
});

test('语法错误', () => {
  assert.throws(() => parsePattern('(a'), (error: unknown) => {
    return error instanceof RegexSyntaxError && /缺少右括号/.test(error.message);
  });
  assert.throws(() => parsePattern('a)'), /多余的右括号/);
  assert.throws(() => parsePattern('*a'), /量词前面没有可重复/);
  assert.throws(() => parsePattern('a**'), /量词不能连续/);
  assert.throws(() => parsePattern('^*'), /锚点不能被量词/);
  assert.throws(() => parsePattern('(?<x>a)'), /命名分组/);
  assert.throws(() => parsePattern('a{2,1}'), /量词下限/);
  assert.throws(() => parsePattern('a{100000000}'), /量词上限过大/);
});

test('解析结果保留 token 流', () => {
  const { tokens } = parsePattern('ab|c');
  assert.deepEqual(
    tokens.map((token) => token.kind),
    ['charset', 'charset', 'alt', 'charset', 'eof'],
  );
});
