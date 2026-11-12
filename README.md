# regex-from-scratch

从零实现的正则表达式引擎，用 TypeScript 完整走一遍编译原理的经典管线：

```
源码 → 词法分析 → 递归下降语法分析 → AST
     → Thompson 构造 → NFA → 子集构造 → DFA → 分区细化最小化
     → NFA 集合模拟匹配
```

目标不是替代原生 `RegExp`，而是把「正则表达式如何变成有限自动机」这件事拆开、写清楚、可测试、可视化。

## 特性

- **零运行时依赖**：只用 TypeScript 类型和 Node.js 标准库。
- **完整前端**：手写词法分析器与递归下降解析器，错误信息带位置与指示符。
- **Thompson NFA**：连接、选择、闭包、有界重复全部用 ε 边构造。
- **NFA 集合模拟**：正确处理 ε 环、空串、零宽断言，天然支持子串搜索。
- **最左最长语义**：POSIX 风格，`a|ab` 匹配 `"ab"` 返回 `"ab"`。
- **DFA 构造与最小化**：子集构造 + Moore 分区细化，支持导出表格与 Graphviz DOT。
- **图结构可视化**：AST / NFA / DFA 可导出 Markdown（Mermaid）或独立 HTML，直接在 VS Code 预览或浏览器查看。
- **Unicode 码点**：按码点迭代，字符类用区间集合表示；`index/end` 仍是 UTF-16 下标。
- **现代工具链**：Node.js ≥ 22.18 直接运行 `.ts`，`node:test`、严格 TS、ESM、erasable syntax。

## 快速开始

要求 Node.js **≥ 22.18**（原生 TypeScript 类型剥离）。

```bash
npm install        # 只有 typescript / @types/node 两个开发依赖
npm test           # 58 个单元 / 对拍 / 模糊 / CLI / 可视化测试
npm run demo       # 编译管线与匹配演示
npm run typecheck  # tsc --noEmit
npm run build      # 输出到 dist/
npm run viz -- '(a|b)*abb'          # Markdown（Mermaid）输出到终端
npm run viz -- '(a|b)*abb' --html   # 生成 regex-visualization.html
```

### 作为库使用

```ts
import { Regex } from './src/index.ts';

const regex = new Regex('(a|b)*abb');

regex.test('xxababb');        // true（子串搜索）
regex.testFull('aabb');       // true（整串匹配）
regex.exec('xxababb');        // { index: 2, end: 7, value: 'ababb' }
regex.findAll('abb abb');     // 所有不重叠匹配
regex.replace('abb abb', 'X') // 'X X'

new Regex('a|ab').exec('ab'); // 最左最长 → 'ab'
new Regex('^b$', { multiline: true }).test('a\nb\nc'); // true

const dfa = regex.toDFA();          // 子集构造
const minimal = regex.toDFA(true);  // 最小化
console.log(minimal.toTable());     // ASCII 状态转移表
console.log(minimal.toDot());       // 粘贴到 Graphviz
```

### 命令行

```bash
npm run cli -- test '(a|b)*abb' 'xxababb'
npm run cli -- full '[a-z]+' 'hello'
npm run cli -- exec 'a|ab' 'xxab'
npm run cli -- find '\d+' 'a12b345'
npm run cli -- replace 'a+' 'baaac' 'X'
npm run cli -- debug '(a|b)*abb' --min
npm run cli -- debug '(a|b)*abb' --dot-dfa --min
npm run cli -- visualize '(a|b)*abb'              # Markdown 到终端
npm run cli -- visualize '(a|b)*abb' --output out.md
npm run cli -- visualize '(a|b)*abb' --html       # 默认写 regex-visualization.html
npm run cli -- visualize '^a\d+$' --min           # 只展示最小化 DFA
```

`debug` 会依次打印 AST、NFA（状态与边）、原始 DFA 和最小化 DFA；加 `--dot-nfa` / `--dot-dfa` 可输出 Graphviz DOT。

`visualize` 输出 Markdown（Mermaid 图 + DFA 转移表）或独立 HTML。Markdown 可直接在 VS Code 的 Markdown 预览、GitHub 或支持 Mermaid 的编辑器中渲染；HTML 用浏览器打开即可，图表通过 CDN 加载 Mermaid。`--output -` 可强制打印到终端。

标志位：`-i` 忽略大小写，`-m` 多行锚点，`-s` 点号匹配换行，可组合为 `-ims`。

## 支持的语法

| 语法 | 含义 |
| --- | --- |
| `abc` | 字面量连接 |
| `a\|b` | 选择 |
| `( ... )`、`(?: ... )` | 分组（不捕获） |
| `*`、`+`、`?` | 闭包、正闭包、可选 |
| `{n}`、`{n,}`、`{n,m}` | 有界重复（上限 `maxRepeat`，默认 1000） |
| `.` | 除换行外的任意码点（`s` 标志下匹配任意码点） |
| `[abc]`、`[^abc]`、`[a-z]` | 字符类、否定、范围 |
| `\d \D \w \W \s \S` | 预定义字符类（ASCII 风格，`\s` 含 Unicode 空白） |
| `\n \r \t \f \v \0` | 控制字符 |
| `\xHH`、`\uHHHH`、`\u{1F600}` | 十六进制 / Unicode 码点转义 |
| `^`、`$` | 行首 / 行尾断言（配合 `m` 标志） |

转义字符本身（如 `\.`、`\*`）直接表示字面量。

**暂不支持**：捕获组、反向引用、前后瞻、`\b` 单词边界、懒惰量词、Unicode 属性转义 `\p{...}`、内联标志 `(?i)`。

## 语义约定

- **最左最长**：先选最早起点，再在该起点取最长匹配。这与 JavaScript 的「最左优先、交替从左到右」不同，例如 `a|ab` 对 `"ab"` 返回 `"ab"`。
- **空匹配推进**：`findAll` / `replace` 遇到空匹配时按一个 Unicode 码点前进，避免死循环；末尾允许最后一个空匹配，与原生 `RegExp` 一致。
- **索引单位**：`index/end` 使用 UTF-16 下标（与 JS 字符串一致），内部推进按码点。
- **锚点**：`$` 在非多行模式下也匹配「末尾换行符之前」的位置（与 JS 一致）。
- **DFA 与锚点**：`^`/`$` 依赖输入位置，含锚点的模式调用 `toDFA()` 会抛出 `RegexCompileError`，请使用 NFA 匹配。
- **大小写折叠**：`i` 标志在**取反之前**折叠，因此 `[^a]/i` 会同时排除 `a` 和 `A`。

## 架构

| 阶段 | 文件 | 关键点 |
| --- | --- | --- |
| 字符集 | `src/charset.ts` | 有序不重叠区间；并/交/补/大小写折叠；`[0, 0x10FFFF]` |
| 词法 | `src/lexer.ts` | 转义、字符类、区间量词；拒绝未支持语法并报位置 |
| 语法 | `src/parser.ts` | 递归下降：选择 → 连接 → 重复 → 原子 |
| AST | `src/ast.ts` | `empty / charset / concat / alt / repeat / assert` |
| NFA | `src/nfa.ts` | Thompson 构造；ε 边；量词展开与状态上限保护 |
| DFA | `src/dfa.ts` | 字母表等价类、子集构造、Moore 最小化 |
| 匹配 | `src/matcher.ts` | 带起始位置的集合模拟；零宽断言；最左最长 |
| API | `src/regex.ts` | 编译、匹配、查找替换、DFA 缓存 |
| CLI | `src/cli.ts` | 调试与可视化入口 |
| 可视化 | `src/visualize.ts` | AST/NFA/DFA → Mermaid Markdown / 独立 HTML |

一个有意思的细节：`(a|b)*abb` 的**原始子集构造**会得到 5 个状态，因为 Thompson 构造中的 ε 分支让「起点」与「读入一个 b 后」的 NFA 状态集合不同；做分区细化最小化后才合并为教科书里的经典 4 状态 DFA。测试同时断言了这两个数字。

## 项目结构

```
src/        引擎实现（charset → lexer → parser → nfa → dfa → matcher → regex）
test/       单元测试、NFA/DFA 等价性、原生 RegExp 对拍、CLI/可视化测试
examples/   可运行的管线演示
docs/       理论说明（词法/语法、Thompson、子集构造、最小化、匹配、测试、可视化）
```

## 测试

```bash
npm test
```

覆盖内容：

- 字符集归一化、集合运算、大小写折叠；
- 词法与语法错误、错误位置；
- NFA 匹配语义（ε 环、空串、量词、字符类、锚点、Unicode）；
- DFA 与 NFA 的语言等价性（穷举短串）、最小化等价性与幂等性；
- 与原生 `RegExp` 的布尔/整串对拍，以及种子化随机模糊测试；
- CLI 各子命令、退出码与调试输出。

## 文档

- [docs/01-lexer-parser.md](docs/01-lexer-parser.md)：词法分析与递归下降
- [docs/02-thompson-nfa.md](docs/02-thompson-nfa.md)：Thompson 构造
- [docs/03-dfa.md](docs/03-dfa.md)：子集构造与 DFA 最小化
- [docs/04-matching.md](docs/04-matching.md)：集合模拟与最左最长
- [docs/05-testing.md](docs/05-testing.md)：测试策略与对拍方法
- [docs/06-visualization.md](docs/06-visualization.md)：Markdown / HTML 图结构可视化

## 限制与路线图

- [ ] 捕获组与反向引用（需要扩展 NFA / 回溯或 tagged DFA）
- [ ] 前后瞻断言
- [ ] 懒惰量词与占有量词
- [ ] Unicode 属性转义与更完整的 `\w`
- [ ] DFA 直接执行匹配（当前 DFA 主要用于教学与整串判定）
- [ ] 基于 DFA 的批量扫描与最长匹配词法分析器示例

## License

MIT
