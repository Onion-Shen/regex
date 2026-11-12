# 01 · 词法分析与递归下降

对应源码：`src/lexer.ts`、`src/parser.ts`、`src/ast.ts`、`src/charset.ts`。

## 1. 为什么先做词法分析

正则源码是字符流，但语法分析只关心「原子 / 量词 / 分组 / 选择」这些结构。词法分析把字符流切成 Token，同时把字符类、转义、`.` 等直接转换成 `CharSet`，让 parser 不需要再关心 Unicode 细节。

Token 的形态（简化）：

```ts
type Token =
  | { kind: 'charset'; set: CharSet; raw: string; pos: number }
  | { kind: 'assert'; assertion: 'start' | 'end'; ... }
  | { kind: 'repeat'; min: number; max: number | null; ... }
  | { kind: 'alt' | 'lparen' | 'rparen' | 'star' | 'plus' | 'question' | 'eof'; ... };
```

Token 保留 `raw` 与 `pos`，用于报错和调试输出。

## 2. 字符集：所有匹配都落在码点区间上

`CharSet` 是一个**不可变**的、已排序且已合并的闭区间集合，范围是 `[0, 0x10FFFF]`。

```ts
class CharSet {
  readonly ranges: readonly CharRange[];
  contains(cp: number): boolean;  // 二分查找
  union(other): CharSet;
  intersect(other): CharSet;
  complement(): CharSet;
  caseFold(): CharSet;
}
```

关键设计：

- **区间而不是位图**：Unicode 全量 110 万码点，用区间才能保持小且可组合。
- **归一化**：构造时排序并合并相邻/重叠区间，后续运算与输出稳定。
- **取反在全集上做**：`[^\d]` 直接是 `DIGIT.complement()`。
- **大小写折叠**：对每个码点补充 `toLowerCase/toUpperCase` 的变体。极大的区间（超过 4096 个码点）跳过逐点折叠，避免 `[^a]` 这种大集合在编译期爆炸；这是有意的取舍。

`.` 对应 `CharSet.DOT = ALL \ {LF, CR, LS, PS}`；`s` 标志下直接用 `ALL`。

## 3. 字符类与转义

`[...]` 的处理要点：

1. 开头的 `^` 表示取反。
2. 逐个读「类原子」：普通字符、转义、预定义类（`\d` 等）。
3. 只有当左右端点都是**单码点**时，`-` 才构成范围；`[\d-a]` 这类写法直接报错。
4. 范围端点倒序报错。
5. `i` 标志下**先折叠再取反**，保证 `[^a]/i` 同时排除 `a` 与 `A`。

转义支持 `\d \D \w \W \s \S`、控制字符、`\xHH`、`\uHHHH`、`\u{...}`。未实现的语法（反向引用、`\b`、`\p{...}`、命名组、前后瞻）在词法阶段就抛出 `RegexSyntaxError`，并带上出错位置。

## 4. 文法与优先级

parser 是递归下降，优先级从低到高：

```
pattern   := alternation EOF
alternation := concat ('|' concat)*
concat    := repeat*
repeat    := atom ( '*' | '+' | '?' | '{n}' | '{n,}' | '{n,m}' )?
atom      := charset | assert | '(' alternation ')'
```

- **连接是隐式的**：相邻 atom 直接组成 `concat`。
- **量词只作用于前一个 atom**，不允许连续量词（`a**` 报错），也不允许量词作用于锚点（`^*` 报错）。
- **空分支合法**：`a|` 解析为 `alt(a, empty)`，`()` 解析为 `empty`。
- 量词上限 `1_000_000`，超出报错，防止 `a{999999999}` 这类输入拖垮编译。

AST 节点：

```ts
type Ast =
  | { kind: 'empty' }
  | { kind: 'charset'; set: CharSet }
  | { kind: 'concat'; parts: readonly Ast[] }
  | { kind: 'alt'; options: readonly Ast[] }
  | { kind: 'repeat'; node: Ast; min: number; max: number | null }
  | { kind: 'assert'; assertion: 'start' | 'end' };
```

parser 会顺手做少量结构规整：单元素连接/选择直接返回子节点，避免无意义的嵌套。

## 5. 错误信息

`RegexSyntaxError` 保存模式串与位置，渲染成：

```
正则语法错误: 字符类缺少右侧的 ]
/^(abc$/
      ^
```

错误位置来自 Token 的 `pos`，字符类内部错误则指向 `[` 的起点，方便定位。

## 6. 小结

到这一步，正则源码已经变成一棵只含「字符集、连接、选择、重复、断言」的 AST。它不依赖任何匹配算法，后面 NFA 和 DFA 都只是对这棵树的不同解释方式。
