import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

function run(...args: string[]): string {
  return execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('CLI test / full / exec', () => {
  assert.equal(run('test', '(a|b)*abb', 'xxababb').trim(), 'true');
  assert.equal(run('full', '(a|b)*abb', 'ababb').trim(), 'true');
  assert.equal(run('full', '(a|b)*abb', 'abab').trim(), 'false');

  const match = JSON.parse(run('exec', 'a+', 'baaac')) as {
    index: number;
    end: number;
    value: string;
  };
  assert.deepEqual(match, { index: 1, end: 4, value: 'aaa' });
});

test('CLI 标志与替换', () => {
  assert.equal(run('test', 'abc', 'ABC', '-i').trim(), 'true');
  assert.equal(run('replace', 'a+', 'baaac', '<$&>').trim(), 'b<aaa>c');
  assert.equal(run('replace', '\\d+', 'a12b7', '#').trim(), 'a#b#');
});

test('CLI debug 输出 AST / NFA / DFA', () => {
  const output = run('debug', '(a|b)*abb', '--min');
  assert.match(output, /AST:/);
  assert.match(output, /NFA:/);
  assert.match(output, /DFA（子集构造）/);
  assert.match(output, /DFA（最小化）: 4 个状态/);
});

test('CLI 错误退出码与帮助信息', () => {
  const failure = spawnSync(process.execPath, [cli, 'test', '(a', 'x'], {
    encoding: 'utf8',
  });
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /缺少右括号/);

  const help = run('help');
  assert.match(help, /用法:/);
});
