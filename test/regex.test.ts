import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RegexCompileError } from '../src/errors.ts';
import { Regex, type RegexOptions } from '../src/regex.ts';

function rx(pattern: string, options?: RegexOptions): Regex {
  return new Regex(pattern, options);
}

function full(pattern: string, input: string, options?: RegexOptions): boolean {
  return rx(pattern, options).testFull(input);
}

function spans(pattern: string, input: string, options?: RegexOptions): Array<[number, number]> {
  return rx(pattern, options)
    .findAll(input)
    .map((match) => [match.index, match.end]);
}

test('字面量、连接与子串搜索', () => {
  assert.equal(full('abc', 'abc'), true);
  assert.equal(full('abc', 'abcd'), false);
  assert.equal(rx('abc').test('xxabcxx'), true);
  assert.equal(rx('abc').test('ab'), false);
  assert.equal(full('a(b|c)d', 'abd'), true);
  assert.equal(full('a(b|c)d', 'acd'), true);
  assert.equal(full('a(b|c)d', 'ad'), false);
  assert.equal(rx('a|bc').test('zzbc'), true);
});

test('量词', () => {
  assert.equal(full('a*', ''), true);
  assert.equal(full('a*', 'aaaa'), true);
  assert.equal(full('a*', 'b'), false);
  assert.equal(full('a+', ''), false);
  assert.equal(full('a+', 'aaa'), true);
  assert.equal(full('a?', ''), true);
  assert.equal(full('a?', 'a'), true);
  assert.equal(full('a?', 'aa'), false);
  assert.equal(full('a{2,4}', 'a'), false);
  assert.equal(full('a{2,4}', 'aaa'), true);
  assert.equal(full('a{2,4}', 'aaaaa'), false);
  assert.equal(full('(ab)+', 'ababab'), true);
  assert.equal(full('(ab)+', 'aba'), false);
  assert.equal(full('a{0}', ''), true);
  assert.equal(full('a{0}', 'a'), false);
});

test('epsilon 环不会导致死循环', () => {
  assert.equal(full('(a*)*', ''), true);
  assert.equal(full('(a*)*', 'aaaa'), true);
  assert.equal(full('(a*)*', 'b'), false);
  assert.equal(full('(a?)*', 'aaa'), true);
  assert.equal(full('(a|)*', 'aa'), true);
});

test('最左最长匹配语义', () => {
  assert.deepEqual(rx('a|ab').exec('ab'), { index: 0, end: 2, value: 'ab' });
  assert.deepEqual(rx('b|ab').exec('ab'), { index: 0, end: 2, value: 'ab' });
  assert.deepEqual(rx('a+').exec('baaac'), { index: 1, end: 4, value: 'aaa' });
  assert.deepEqual(rx('a*').exec('ba'), { index: 0, end: 0, value: '' });
  assert.deepEqual(rx('[ab]+').exec('xxabba'), { index: 2, end: 6, value: 'abba' });
  assert.deepEqual(rx('a|ab').exec('xab'), { index: 1, end: 3, value: 'ab' });
});

test('点号、换行与 dotAll', () => {
  assert.equal(full('.', 'a'), true);
  assert.equal(full('.', '\n'), false);
  assert.equal(full('.', '\n', { dotAll: true }), true);
  assert.equal(full('.', ''), false);
  assert.equal(full('..', '😀x'), true);
  assert.deepEqual(rx('.').exec('😀x'), { index: 0, end: 2, value: '😀' });
});

test('字符类与预定义类', () => {
  assert.equal(full('[abc]+', 'cabb'), true);
  assert.equal(full('[^abc]+', 'xyz'), true);
  assert.equal(full('[^abc]+', 'xay'), false);
  assert.equal(full('[a-z]+', 'hello'), true);
  assert.equal(full('\\d+', '12345'), true);
  assert.equal(full('\\d+', '12a'), false);
  assert.equal(full('\\w+', 'a_1'), true);
  assert.equal(full('\\s+', ' \t\u3000'), true);
  assert.equal(full('[\\u4e00-\\u9fff]+', '中文'), true);
  assert.equal(full('[^]', '\n'), true);
  assert.equal(rx('[]').test('a'), false);
  assert.equal(full('[\\dA-F]+', '12BF'), true);
});

test('锚点与多行模式', () => {
  assert.equal(rx('^abc').test('abcx'), true);
  assert.equal(rx('^abc').test('xabc'), false);
  assert.equal(rx('abc$').test('xabc'), true);
  assert.equal(rx('abc$').test('abcx'), false);
  assert.equal(full('^abc$', 'abc'), true);
  assert.equal(full('^abc$', 'xabc'), false);

  assert.equal(rx('^b').test('a\nb'), false);
  assert.equal(rx('^b', { multiline: true }).test('a\nb'), true);
  assert.equal(rx('b$').test('b\nc'), false);
  assert.equal(rx('b$', { multiline: true }).test('b\nc'), true);

  assert.equal(rx('a$').test('a\n'), true);
  assert.equal(rx('a$').test('a\nb'), false);

  assert.deepEqual(spans('^', 'a\nb', { multiline: true }), [
    [0, 0],
    [2, 2],
  ]);
  assert.deepEqual(spans('$', 'a\nb', { multiline: true }), [
    [1, 1],
    [3, 3],
  ]);
});

test('忽略大小写', () => {
  assert.equal(rx('abc').test('ABC'), false);
  assert.equal(rx('abc', { ignoreCase: true }).test('ABC'), true);
  assert.equal(full('[a-z]+', 'HELLO', { ignoreCase: true }), true);
  assert.equal(full('[^a]+', 'A', { ignoreCase: true }), false);
  assert.equal(full('[^a]+', 'B', { ignoreCase: true }), true);
  assert.equal(full('é', 'É', { ignoreCase: true }), true);
});

test('findAll：不重叠、空匹配推进', () => {
  assert.deepEqual(spans('aa', 'aaaa'), [
    [0, 2],
    [2, 4],
  ]);
  assert.deepEqual(spans('a*', 'ba'), [
    [0, 0],
    [1, 2],
    [2, 2],
  ]);
  assert.deepEqual(spans('', 'ab'), [
    [0, 0],
    [1, 1],
    [2, 2],
  ]);
  assert.deepEqual(spans('', '😀'), [
    [0, 0],
    [2, 2],
  ]);
  assert.deepEqual(spans('aba', 'ababa'), [[0, 3]]);
});

test('replace：模板、函数与空匹配', () => {
  assert.equal(rx('a+').replace('baaac', 'X'), 'bXc');
  assert.equal(rx('a+').replace('baaac', '<$&>'), 'b<aaa>c');
  assert.equal(rx('a+').replace('baaac', '$$'), 'b$c');
  assert.equal(rx('a+').replace('baaac', (match) => match.value.toUpperCase()), 'bAAAc');
  assert.equal(rx('(a)').replace('a', '$1'), '$1');
  assert.equal(rx('').replace('ab', 'X'), 'XaXbX');
  assert.equal(rx('a').replace('aaa', 'X'), 'XXX');
});

test('fromIndex 起始位置', () => {
  assert.deepEqual(rx('a').exec('ba', 1), { index: 1, end: 2, value: 'a' });
  assert.equal(rx('a').exec('ba', 2), null);
  assert.equal(rx('a').test('ba', 1), true);
  assert.deepEqual(rx('a').exec('ba', -5), { index: 1, end: 2, value: 'a' });
  assert.equal(rx('^a').exec('ab', 1), null);
});

test('Unicode 字面量与字符类', () => {
  assert.equal(rx('😀').test('a😀b'), true);
  assert.equal(full('[😀😁]', '😁'), true);
  assert.equal(full('[😀😁]', '😂'), false);
  assert.deepEqual(rx('😀').exec('a😀b'), { index: 1, end: 3, value: '😀' });
});

test('matchFull 与 testFull', () => {
  const regex = rx('a+');
  assert.deepEqual(regex.matchFull('aaa'), { index: 0, end: 3, value: 'aaa' });
  assert.equal(regex.matchFull('aaab'), null);
  assert.equal(regex.testFull('b'), false);
});

test('编译期限制与错误', () => {
  assert.throws(() => rx('a{2000}'), RegexCompileError);
  assert.throws(() => rx('a{1001}'), RegexCompileError);
  assert.throws(() => rx('a{5}', { maxRepeat: 4 }), RegexCompileError);
  assert.throws(() => rx('abc', { maxStates: 2 }), RegexCompileError);
  assert.throws(() => new Regex(123 as unknown as string), TypeError);
  assert.throws(() => rx('a').test(123 as unknown as string), TypeError);
});

test('flags 字符串与 toString', () => {
  assert.equal(rx('a').toString(), '/a/');
  assert.equal(rx('a', { ignoreCase: true, multiline: true, dotAll: true }).flags, 'ims');
  assert.equal(rx('a').toString(), '/a/');
});
