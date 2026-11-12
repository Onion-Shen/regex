import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CharSet,
  MAX_CODE_POINT,
  escapeCodePoint,
  isLineTerminator,
} from '../src/charset.ts';

test('CharSet 归一化、合并与查询', () => {
  const set = CharSet.of([
    [98, 100],
    [97, 99],
  ]);

  assert.deepEqual(set.ranges, [{ lo: 97, hi: 100 }]);
  assert.ok(set.contains(97));
  assert.ok(set.contains(100));
  assert.ok(!set.contains(96));
  assert.ok(!set.contains(101));
  assert.equal(CharSet.EMPTY.isEmpty, true);
  assert.equal(CharSet.ALL.isAll, true);
});

test('union / intersect / complement', () => {
  const abc = CharSet.ofString('abc');
  assert.ok(abc.union(CharSet.ofString('def')).equals(CharSet.ofString('abcdef')));
  assert.ok(abc.intersect(CharSet.ofString('bcd')).equals(CharSet.ofString('bc')));
  assert.ok(CharSet.EMPTY.union(abc).equals(abc));
  assert.ok(abc.union(CharSet.EMPTY).equals(abc));

  assert.ok(CharSet.EMPTY.complement().isAll);
  assert.ok(CharSet.ALL.complement().isEmpty);
  assert.ok(CharSet.single('a').intersect(CharSet.single('a').complement()).isEmpty);

  const notAbc = abc.complement();
  assert.ok(!notAbc.contains(97));
  assert.ok(notAbc.contains(100));
  assert.ok(notAbc.contains(MAX_CODE_POINT));
});

test('大小写闭包', () => {
  assert.ok(CharSet.single('a').caseFold().contains('A'.codePointAt(0)!));
  assert.ok(CharSet.single('Z').caseFold().contains('z'.codePointAt(0)!));
  assert.ok(CharSet.of([[97, 122]]).caseFold().contains('A'.codePointAt(0)!));
  assert.ok(CharSet.of([[65, 90]]).caseFold().contains('a'.codePointAt(0)!));
  assert.ok(!CharSet.single('1').caseFold().contains(49 + 1));
});

test('取反在大小写闭包之后执行才能得到正确语义', () => {
  const notA = CharSet.single('a').caseFold().complement();
  assert.ok(notA.contains('b'.codePointAt(0)!));
  assert.ok(!notA.contains('a'.codePointAt(0)!));
  assert.ok(!notA.contains('A'.codePointAt(0)!));
});

test('Unicode 码点与转义显示', () => {
  assert.ok(CharSet.single('😀').contains(0x1f600));
  assert.equal(escapeCodePoint(0x0a), '\\n');
  assert.equal(escapeCodePoint(0x09), '\\t');
  assert.equal(escapeCodePoint(0x5c), '\\\\');
  assert.equal(escapeCodePoint(0x41), 'A');
  assert.equal(escapeCodePoint(0x00e9), '\\xe9');
  assert.equal(escapeCodePoint(0x4e2d), '\\u4e2d');
  assert.equal(escapeCodePoint(0x1f600), '\\u{1f600}');

  assert.ok(isLineTerminator(0x0a));
  assert.ok(isLineTerminator(0x2028));
  assert.ok(!isLineTerminator(0x20));
});

test('预定义字符类', () => {
  assert.ok(CharSet.DIGIT.contains('7'.codePointAt(0)!));
  assert.ok(!CharSet.DIGIT.contains('a'.codePointAt(0)!));
  assert.ok(CharSet.WORD.contains('_'.codePointAt(0)!));
  assert.ok(CharSet.WORD.contains('z'.codePointAt(0)!));
  assert.ok(CharSet.SPACE.contains(0x09));
  assert.ok(CharSet.SPACE.contains(0x3000));
  assert.ok(!CharSet.DOT.contains(0x0a));
  assert.ok(CharSet.ALL.contains(0x0a));
});
