# AGENTS.md

本仓库是一个教学导向、从零实现的 TypeScript 正则表达式引擎。修改代码时优先保证**语义正确、结构清晰、可测试**，而不是堆功能。

## 环境

- Node.js **≥ 22.18**（直接运行 `.ts`，依赖原生类型剥离）。
- 开发依赖只有 `typescript` 与 `@types/node`；不要引入运行时依赖。
- 包管理与脚本见 `package.json`。

## 常用命令

```bash
npm install        # 安装开发依赖
npm test           # node --test test/*.test.ts
npm run test:watch # 监听模式
npm run typecheck  # tsc --noEmit（包含 test/examples）
npm run build      # tsc -p tsconfig.build.json → dist/
npm run demo       # examples/demo.ts
npm run cli -- <command> ...  # src/cli.ts
npm run viz -- <pattern>      # 输出 Markdown/Mermaid；加 --html 生成 HTML
```

提交前至少运行 `npm run typecheck && npm test`。改动 DFA/最小化/匹配语义时，`npm run demo` 也应人工检查输出。

## 代码约定

- **ESM + 显式扩展名**：源码内互相引用必须写 `./xxx.ts`。`tsconfig` 已开启 `allowImportingTsExtensions` 与 `rewriteRelativeImportExtensions`，构建时会改写成 `.js`。
- **erasable syntax only**：不要使用 `enum`、`namespace`、构造函数参数属性。类型导入使用 `import type` / `export type`（`verbatimModuleSyntax`）。
- **严格模式**：`strict` + `noUncheckedIndexedAccess`。访问数组元素后使用 `!` 前先确认边界已检查。
- **文件名小写**：`nfa.ts`、`dfa.ts`……不要创建大写开头的源文件名（大小写不敏感文件系统上曾出现 `NFA.ts`/`nfa.ts` 冲突）。
- **无注释优先**：只有「为什么」不明显时才写注释；不要写复述代码的注释。
- 错误统一抛 `RegexSyntaxError`（带位置与指示符）或 `RegexCompileError`（编译上限/不支持能力）。

## 架构不变量

管线：`charset → lexer → parser → ast → nfa → dfa → matcher`，对外入口 `regex.ts` / `index.ts`。

- **CharSet** 永远保持有序、合并、不重叠的闭区间；所有集合运算必须返回新实例（不可变）。
- **lexer** 负责语法识别与字符集构造（含 `i` 折叠）；**parser** 不直接处理字符集语义。
- **parser** 只产出 AST，不做 NFA 构造；量词优先级与结合性在 parser 中确定。
- **NFA** 必须是纯 Thompson 构造（ε 边 + 字符边 + 断言边），不要在构造阶段做子集合并。
- **DFA** 的字母表按字符集边界划分等价类；转移表中的 `-1` 表示死状态。含锚点的 NFA 不允许 `determinize`。
- **matcher** 默认使用 NFA 集合模拟，锚点只能在这里求值；不要在 NFA 上做位置相关的静态化简。
- **Regex** 缓存 DFA（`toDFA(false/true)`），匹配默认走 NFA。
- **visualize** 只读取公开结构（AST/NFA/DFA），不要在可视化层反向影响匹配语义。

## 语义约定（改动前必读）

- 匹配采用**最左最长**（POSIX 风格），不是 JavaScript 的最左优先。涉及交替的顺序时不要以 `RegExp` 结果为准。
- `findAll`/`replace` 的空匹配按**一个 Unicode 码点**推进，末尾允许空匹配。
- `index/end` 是 UTF-16 下标；内部迭代按码点，`codePointAt` 后注意代理对宽度。
- `i` 标志先在正字符集上折叠再取反（`[^a]/i` 排除 `a` 和 `A`）。
- 非多行 `$` 额外匹配末尾换行符之前的位置。
- 捕获组、反向引用、前后瞻、`\b`、懒惰量词、`\p{...}` 均**未实现**，遇到时应给出明确错误而不是静默降级。

## 新增语法/功能的检查清单

1. `lexer.ts`：新增 Token 或字符集；错误信息带位置。
2. `ast.ts` / `parser.ts`：定义节点与优先级；更新 `formatAst`。
3. `nfa.ts`：实现 Thompson 片段；保持 `maxRepeat` / `maxStates` 上限。
4. `dfa.ts`：确认字母表构建与子集构造仍正确（若引入位置相关语义，DFA 路径要显式拒绝）。
5. `matcher.ts`：若影响匹配语义，同时检查 `find`、`testFull`、`iterateMatches` 三处。
6. `visualize.ts`：若新增 AST/NFA/DFA 结构，更新 Mermaid 生成与可视化测试。
7. `test/`：至少覆盖正常路径、边界（空串/空匹配/Unicode）、错误路径；必要时加对拍或穷举等价性测试。
8. `docs/` 与 `README.md`：更新语法表、限制和示例。

## 测试要求

- 使用 `node:test` + `node:assert/strict`，文件名 `test/*.test.ts`。
- 纯函数优先直接测；引擎行为优先通过 `Regex` 公共 API 测。
- DFA 改动必须跑「NFA 与 DFA 在短串上语言等价」测试。
- 匹配语义改动建议加种子化模糊测试（`test/fuzz.test.ts`），保证可复现。
- 不要为了让测试通过而放宽断言；先确认是测试期望错还是实现错（例如 `(a|b)*abb` 原始 DFA 是 5 状态，最小化后才是 4 状态）。
