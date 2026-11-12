# 文档索引

这套文档按编译管线拆分，建议按顺序阅读：

1. [词法分析与递归下降](01-lexer-parser.md)
2. [Thompson 构造：AST → NFA](02-thompson-nfa.md)
3. [子集构造与 DFA 最小化](03-dfa.md)
4. [NFA 集合模拟与最左最长匹配](04-matching.md)
5. [测试策略与原生 RegExp 对拍](05-testing.md)

配套阅读：

- 仓库根目录 `README.md`：快速开始、语法表、API。
- `AGENTS.md`：工程约定、架构不变量、改动清单。
- `examples/demo.ts`：一条命令跑完整管线。
- `src/cli.ts`：`debug` 子命令可直接观察 AST/NFA/DFA。
