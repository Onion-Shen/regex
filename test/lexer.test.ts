import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RegexSyntaxError } from '../src/errors.ts';
import { tokenize, type LexOptions, type Token } from '../src/lexer.ts';

type CharsetToken = Extract<Token, { kind: 'charset' }>;
type RepeatToken = Extract<Token, { kind: 'repeat' }>;

function kinds(pattern: string, options?: LexOptions): string[] {
  return tokenize(pattern, options).map((token) => token.kind);
}

function charsetToken(pattern: string, index = 0, options?: LexOptions): CharsetToken {
  const token = tokenize(pattern, options)[index]!;
  assert.equal(token.kind, 'charset');
  return token as CharsetToken;
}

function repeatToken(pattern: string): RepeatToken {
  const token = tokenize(pattern)[1]!;
  assert.equal(token.kind, 'repeat');
  return token as RepeatToken;
}

test('基础词法切分', () => {
  assert.deepEqual(kinds('a(b|c)*'), [
    'charset',
    'lparen',
    'charset',
    'alt',
    'charset',
    'rparen',
    'star',
    'eof',
  ]);
  assert.deepEqual(kinds('a|b'), ['charset', 'alt', 'charset', 'eof']);
  assert.deepEqual(kinds('(?:ab)+'), ['lparen', 'charset', 'charset', 'rparen', 'plus', 'eof']);
});

test('量词语法', () => {
  assert.deepEqual(repeatToken('a{2,4}'), {
    kind: 'repeat',
    min: 2,
    max: 4,
    raw: '{2,4}',
    pos: 1,
  });
  assert.equal(repeatToken('a{2,}').max, null);
  assert.equal(repeatToken('a{,3}').min, 0);
  assert.equal(repeatToken('a{,3}').max, 3);
  assert.equal(repeatToken('a{5}').min, 5);
  assert.equal(repeatToken('a{5}').max, 5);

  assert.deepEqual(kinds('a{b}'), ['charset', 'charset', 'charset', 'charset', 'eof']);
  assert.equal(charsetToken('a{b}', 1).raw, '{');
});

test('字符类、范围与取反', () => {
  const mixed = charsetToken('[a-c\\d]').set;
  assert.ok(mixed.contains('b'.codePointAt(0)!));
  assert.ok(mixed.contains('5'.codePointAt(0)!));
  assert.ok(!mixed.contains('z'.codePointAt(0)!));

  const negated = charsetToken('[^a-c]').set;
  assert.ok(!negated.contains('b'.codePointAt(0)!));
  assert.ok(negated.contains('d'.codePointAt(0)!));

  assert.ok(charsetToken('[]').set.isEmpty);
  assert.ok(charsetToken('[^]').set.isAll);

  const dashFirst = charsetToken('[-a]').set;
  assert.ok(dashFirst.contains('-'.codePointAt(0)!));
  assert.ok(dashFirst.contains('a'.codePointAt(0)!));

  const dashLast = charsetToken('[a-]').set;
  assert.ok(dashLast.contains('-'.codePointAt(0)!));
  assert.ok(dashLast.contains('a'.codePointAt(0)!));

  assert.ok(charsetToken('[\\]]').set.contains(']'.codePointAt(0)!));
  assert.ok(charsetToken('[\\b]').set.contains(0x08));
});

test('转义序列', () => {
  assert.ok(charsetToken('\\n').set.contains(0x0a));
  assert.ok(charsetToken('\\t').set.contains(0x09));
  assert.ok(charsetToken('\\x41').set.contains(0x41));
  assert.ok(charsetToken('\\u0042').set.contains(0x42));
  assert.ok(charsetToken('\\u{1F600}').set.contains(0x1f600));
  assert.ok(charsetToken('\\.').set.contains('.'.codePointAt(0)!));
  assert.ok(charsetToken('\\{').set.contains('{'.codePointAt(0)!));
  assert.ok(charsetToken('\\d').set.equals(charsetToken('[0-9]').set));
  assert.ok(charsetToken('\\w').set.contains('_'.codePointAt(0)!));
  assert.ok(charsetToken('\\S').set.contains('a'.codePointAt(0)!));
});

test('点号与 dotAll', () => {
  assert.ok(!charsetToken('.').set.contains(0x0a));
  assert.ok(charsetToken('.', 0, { dotAll: true }).set.contains(0x0a));
  assert.ok(charsetToken('.', 0, { dotAll: true }).set.isAll);
});

test('忽略大小写作用于字面量与字符类', () => {
  assert.ok(charsetToken('a', 0, { ignoreCase: true }).set.contains('A'.codePointAt(0)!));
  assert.ok(
    charsetToken('[a-z]', 0, { ignoreCase: true }).set.contains('Z'.codePointAt(0)!),
  );

  const negated = charsetToken('[^a]', 0, { ignoreCase: true }).set;
  assert.ok(!negated.contains('a'.codePointAt(0)!));
  assert.ok(!negated.contains('A'.codePointAt(0)!));
  assert.ok(negated.contains('b'.codePointAt(0)!));
});

test('不支持的语法给出明确错误', () => {
  assert.throws(() => tokenize('\\1'), /反向引用/);
  assert.throws(() => tokenize('\\k<name>'), /命名反向引用/);
  assert.throws(() => tokenize('(?=a)'), /前瞻/);
  assert.throws(() => tokenize('(?<name>a)'), /命名分组/);
  assert.throws(() => tokenize('\\b'), /单词边界/);
  assert.throws(() => tokenize('\\q'), /未知的转义/);
  assert.throws(() => tokenize('[abc'), /字符类缺少/);
  assert.throws(() => tokenize('[z-a]'), /范围顺序/);
  assert.throws(() => tokenize('[a-\\d]'), /端点/);
  assert.throws(() => tokenize('a{3,1}'), /量词下限/);
  assert.throws(() => tokenize('\\u{110000}'), /超出 Unicode 范围/);
  assert.throws(() => tokenize('\\u12'), /十六进制/);
  assert.throws(() => tokenize('[a-'), /字符类缺少/);
});

test('语法错误携带位置信息', () => {
  try {
    tokenize('ab[cd');
    assert.fail('应当抛出错误');
  } catch (error) {
    assert.ok(error instanceof RegexSyntaxError);
    assert.equal(error.position, 2);
    assert.equal(error.pattern, 'ab[cd');
  }
});
