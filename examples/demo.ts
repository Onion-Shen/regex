import { formatAst, Regex } from '../src/index.ts';

const pattern = '(a|b)*abb';
const regex = new Regex(pattern);

console.log('== 编译管线 ==');
console.log(`pattern: ${regex.toString()}`);
console.log(`\nAST:\n${formatAst(regex.ast)}`);
console.log(`\nNFA 状态数: ${regex.stateCount}`);

const dfa = regex.toDFA();
const minimal = regex.toDFA(true);
console.log(`DFA 状态数: ${dfa.stateCount}（最小化后 ${minimal.stateCount}）`);
console.log(`\n${minimal.toTable()}`);

console.log('\n== 匹配 ==');
for (const input of ['abb', 'aabb', 'ababb', 'abab', 'babb']) {
  console.log(
    `${input.padEnd(6)} test=${String(regex.test(input)).padEnd(5)} full=${regex.testFull(input)}`,
  );
}

console.log('\n== 最左最长语义 ==');
console.log('a|ab 匹配 "ab" →', new Regex('a|ab').exec('ab'));
console.log('(a|b)* 匹配 "abab" →', regex.exec('xxababbzz'));

console.log('\n== 查找与替换 ==');
console.log('a+ in "baaacaa" →', new Regex('a+').findAll('baaacaa'));
console.log(
  '数字替换 →',
  new Regex('\\d+').replace('订单 42，数量 7', (match) => `<${match.value}>`),
);

console.log('\n== Unicode 码点 ==');
const emoji = new Regex('.');
console.log('"." 匹配 "😀x" →', emoji.exec('😀x'), '（index/end 为 UTF-16 下标）');

console.log('\n== 锚点 ==');
const multiline = new Regex('^b$', { multiline: true });
console.log('^b$ /m 匹配 "a\\nb\\nc" →', multiline.findAll('a\nb\nc'));
