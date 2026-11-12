import assert from 'node:assert/strict';
import { test } from 'node:test';
import { determinize, minimizeDfa } from '../src/dfa.ts';
import { RegexCompileError } from '../src/errors.ts';
import { Regex } from '../src/regex.ts';

function words(alphabet: readonly string[], maxLength: number): string[] {
  const result = [''];
  let layer = [''];

  for (let length = 1; length <= maxLength; length += 1) {
    const next: string[] = [];
    for (const prefix of layer) {
      for (const ch of alphabet) {
        next.push(prefix + ch);
      }
    }
    result.push(...next);
    layer = next;
  }

  return result;
}

const BINARY = words(['a', 'b'], 6);

test('子集构造 (a|b)*abb 得到 5 状态 DFA，最小化后为经典 4 状态', () => {
  const regex = new Regex('(a|b)*abb');
  const dfa = regex.toDFA();

  assert.equal(dfa.stateCount, 5);
  assert.equal(dfa.alphabetSize, 3);
  assert.equal(dfa.acceptingStates.length, 1);

  const minimal = dfa.minimize();
  assert.equal(minimal.stateCount, 4);
  assert.equal(minimal.alphabetSize, 3);
  assert.equal(minimal.acceptingStates.length, 1);

  for (const machine of [dfa, minimal]) {
    assert.ok(machine.testFull('abb'));
    assert.ok(machine.testFull('aabb'));
    assert.ok(!machine.testFull('ab'));
    assert.ok(!machine.testFull(''));
    assert.ok(!machine.testFull('abba'));
    assert.equal(machine.start, 0);
  }
});

test('DFA 与 NFA 接受的语言一致', () => {
  const patterns = [
    'a*',
    'a+b?',
    '(ab|ba)*',
    '[ab]{1,3}',
    'a(a|b)*b',
    '(a|b)*abb',
    '[^a]b',
  ];

  for (const pattern of patterns) {
    const regex = new Regex(pattern);
    const dfa = regex.toDFA();
    for (const input of BINARY) {
      assert.equal(
        dfa.testFull(input),
        regex.testFull(input),
        `pattern=${pattern} input=${JSON.stringify(input)}`,
      );
    }
  }
});

test('DFA 最小化保持语言且不增加状态', () => {
  const patterns = ['(a|b)*abb', 'a|b', 'a*', '[ab]{1,3}', 'a(a|b)*b'];

  for (const pattern of patterns) {
    const dfa = new Regex(pattern).toDFA();
    const minimal = dfa.minimize();

    assert.ok(
      minimal.stateCount <= dfa.stateCount,
      `${pattern}: ${minimal.stateCount} <= ${dfa.stateCount}`,
    );

    for (const input of BINARY) {
      assert.equal(
        minimal.testFull(input),
        dfa.testFull(input),
        `pattern=${pattern} input=${JSON.stringify(input)}`,
      );
    }
  }

  assert.equal(new Regex('(a|b)*abb').toDFA(true).stateCount, 4);
});

test('最小化是幂等的', () => {
  const minimal = new Regex('(a|b)*abb').toDFA(true);
  const again = minimizeDfa(minimal);
  assert.equal(again.stateCount, minimal.stateCount);

  for (const input of BINARY) {
    assert.equal(again.testFull(input), minimal.testFull(input));
  }
});

test('字母表等价类与 classOf', () => {
  const dfa = new Regex('[ab]').toDFA();
  assert.equal(dfa.alphabetSize, 2);
  assert.equal(dfa.classOf('a'.codePointAt(0)!), dfa.classOf('b'.codePointAt(0)!));
  assert.notEqual(dfa.classOf('a'.codePointAt(0)!), dfa.classOf('c'.codePointAt(0)!));
  assert.ok(dfa.testFull('a'));
  assert.ok(!dfa.testFull('c'));
});

test('空表达式与取反字符类的 DFA', () => {
  const empty = new Regex('').toDFA();
  assert.equal(empty.stateCount, 1);
  assert.equal(empty.alphabetSize, 0);
  assert.ok(empty.testFull(''));
  assert.ok(!empty.testFull('a'));

  const notA = new Regex('[^a]').toDFA();
  assert.equal(notA.alphabetSize, 2);
  assert.ok(notA.testFull('b'));
  assert.ok(!notA.testFull('a'));
  assert.ok(notA.testFull('😀'));
});

test('锚点无法直接子集构造', () => {
  assert.throws(() => new Regex('^a$').toDFA(), RegexCompileError);
  assert.throws(() => new Regex('a$').toDFA(), /锚点/);
  assert.throws(() => determinize(new Regex('^').nfa), /锚点/);
});

test('DFA 的表格与 dot 输出', () => {
  const dfa = new Regex('(a|b)*abb').toDFA();
  const table = dfa.toTable();
  assert.match(table, /状态/);
  assert.match(table, /S0/);

  const dot = dfa.toDot();
  assert.match(dot, /^digraph DFA \{/);
  assert.match(dot, /doublecircle/);
  assert.match(dot, /s0 -> s/);
});

test('NFA dot 输出包含 epsilon 与接受状态', () => {
  const dot = new Regex('(a|b)*').nfa.toDot();
  assert.match(dot, /^digraph NFA \{/);
  assert.match(dot, /ε/);
  assert.match(dot, /doublecircle/);
});
