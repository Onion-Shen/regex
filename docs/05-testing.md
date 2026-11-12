# 05 · 测试策略与原生 RegExp 对拍

对应源码：`test/*.test.ts`。

## 1. 运行方式

```bash
npm test            # node --test test/*.test.ts
npm run test:watch  # 文件变化时自动重跑
npm run typecheck   # 类型错误单独检查
```

测试使用 Node 内置的 `node:test` 与 `node:assert/strict`，不需要 Jest/Vitest。Node ≥ 22.18 可以直接执行 `.ts` 测试文件。

## 2. 分层测试

| 文件 | 关注点 |
| --- | --- |
| `charset.test.ts` | 区间归一化、并/交/补、大小写折叠、Unicode 转义 |
| `lexer.test.ts` | Token 类型、量词、字符类、转义、`i`/`s`、错误位置 |
| `parser.test.ts` | 优先级、结合性、空分支、分组、错误 |
| `regex.test.ts` | 引擎语义：量词、ε 环、最左最长、锚点、Unicode、查找替换 |
| `dfa.test.ts` | 子集构造、NFA/DFA 等价、最小化、表格/DOT 输出 |
| `fuzz.test.ts` | 种子化随机对拍 |
| `cli.test.ts` | 子命令、标志位、退出码、调试输出 |

原则：纯函数（`CharSet`、lexer、parser）直接测；引擎行为优先通过 `Regex` 公共 API 测，避免测试绑定内部结构。

## 3. 语言等价：NFA vs DFA

`testFull` 不依赖匹配策略，只回答「整串是否属于该语言」。因此可以对同一批模式枚举短串，断言 NFA 与 DFA 的结果完全一致：

```ts
for (const input of words(['a', 'b'], 6)) {
  assert.equal(dfa.testFull(input), regex.testFull(input));
}
```

这类测试能抓住子集构造、ε 闭包、字母表分类、最小化中的大部分错误。

## 4. 与 JavaScript RegExp 对拍

布尔层面的语言等价不受「最左最长 vs 最左优先」影响，因此可以直接对拍：

```ts
const ours = new Regex(pattern);
const native = new RegExp(pattern);

for (const input of inputs) {
  assert.equal(ours.test(input), native.test(input));
}
```

整串匹配对拍时，把模式包成 `^(?:${pattern})$`：

```ts
const native = new RegExp(`^(?:${pattern})$`);
assert.equal(ours.testFull(input), native.test(input));
```

生成器只产生两边都支持且语义一致的构造：字面量、`[ab]`、`[a-c]`、`[^ab]`、`\d`、`.`、连接、`(?:a|b)`、`* + ? {n,m}`，不生成锚点、捕获组、反向引用和懒惰量词。

## 5. 区间对拍为何要限制模式

`findAll` 返回 `[index, end]`。JavaScript 的 `exec` 使用最左优先，因此在有交替时可能与最左最长不同：

```ts
'a|ab' 对 'ab'：本引擎返回 'ab'，JavaScript 返回 'a'
```

所以区间对拍只使用**无分支的贪心表达式**（`simplePattern`：字面量/字符类 + 量词），此时两种策略结果一致。这样既能对比区间，又不会把语义差异误判为 bug。

## 6. 可复现的随机测试

模糊测试使用固定种子的 `mulberry32`，失败时会打印 `pattern` 与输入，便于精确复现：

```ts
const random = mulberry32(0x5eed_2026);
```

当前规模：

- 120 个随机模式 × 12 个输入 = 1440 次子串布尔对拍；
- 120 个随机模式 × 10 个输入 = 1200 次整串对拍；
- 100 个无分支模式 × 8 个输入 = 800 次区间对拍。

种子固定意味着结果是确定的；修改生成器或算法后如果失败，可以直接用打印出的模式和输入定位。

## 7. 边界用例清单

新增功能时至少考虑：

- 空串、空分支（`a|`、`()`）、空匹配（`a*`、`""`）；
- 量词边界：`{0}`、`{1}`、`{0,0}`、`{n,}`、超上限；
- ε 环：`(a*)*`、`(a|ε)*`、`(a?)*`；
- Unicode 代理对：`😀`、`.`、`\u{1F600}`；
- 锚点：单行/多行、末尾换行、空输入；
- 错误路径：未闭合分组/字符类、连续量词、量词作用于锚点、未支持语法。

## 8. 加新测试的建议

1. 先写一个最小失败用例，确认是测试期望错还是实现错。
2. 公共语义用 `Regex` API 断言；内部不变量（如 `stateCount`）只在教学价值明确时断言。
3. 改动 DFA/最小化后，务必保留「NFA 与 DFA 语言等价」的穷举测试。
4. 改动匹配循环后，检查 `find`、`testFull`、`iterateMatches` 三条路径，并补一条空匹配/Unicode 用例。
