import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Regex } from '../src/regex.ts';
import {
  astToMermaid,
  dfaToMermaid,
  nfaToMermaid,
  toHtml,
  toMarkdown,
} from '../src/visualize.ts';

test('AST / NFA / DFA 都能生成 Mermaid 图', () => {
  const regex = new Regex('(a|b)*abb');

  const ast = astToMermaid(regex.ast);
  assert.match(ast, /^flowchart TD/);
  assert.match(ast, /alt/);
  assert.match(ast, /repeat #123;0,#125;/);

  const nfa = nfaToMermaid(regex.nfa);
  assert.match(nfa, /^flowchart LR/);
  assert.match(nfa, /startNode --> q6/);
  assert.match(nfa, /class q6 initial;/);
  assert.match(nfa, /class q13 accepting;/);
  assert.match(nfa, /q0 -- "ε" --> q2/);

  const raw = dfaToMermaid(regex.toDFA());
  assert.match(raw, /startNode --> s0/);
  assert.match(raw, /s3 -- "#91;a#93;" --> s1/);

  const minimal = dfaToMermaid(regex.toDFA(true));
  assert.match(minimal, /class s3 accepting;/);
  assert.equal(minimal.match(/^  s\d+\[/gm)?.length, 4);
});

test('Markdown 包含 Mermaid 图与 DFA 转移表', () => {
  const markdown = toMarkdown(new Regex('(a|b)*abb'));

  assert.match(markdown, /^# 正则可视化/);
  assert.match(markdown, /## AST/);
  assert.match(markdown, /## NFA（14 个状态）/);
  assert.match(markdown, /DFA（子集构造，5 状态）/);
  assert.match(markdown, /DFA（最小化，4 状态）/);
  assert.match(markdown, /```mermaid/);
  assert.match(markdown, /\| → S0 \|/);
  assert.match(markdown, /\| S4 \| ✓ \|/);
});

test('minimizeOnly 只展示最小化 DFA', () => {
  const markdown = toMarkdown(new Regex('(a|b)*abb'), { minimizeOnly: true });

  assert.doesNotMatch(markdown, /DFA（子集构造/);
  assert.match(markdown, /DFA（最小化，4 状态）/);
});

test('含锚点时跳过 DFA 并保留 NFA 图', () => {
  const markdown = toMarkdown(new Regex('^a$'));

  assert.match(markdown, /## NFA/);
  assert.match(markdown, /## DFA/);
  assert.match(markdown, /包含锚点/);
  assert.doesNotMatch(markdown, /DFA（子集构造/);
});

test('HTML 是独立页面并正确转义用户输入', () => {
  const html = toHtml(new Regex('a<b'));

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /class="mermaid"/);
  assert.match(html, /cdn\.jsdelivr\.net/);
  assert.match(html, /<title>正则可视化：\/a&lt;b\/<\/title>/);
  assert.doesNotMatch(html, /<b>/);
});
