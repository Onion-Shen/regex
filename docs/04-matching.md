# 04 · NFA 集合模拟与最左最长匹配

对应源码：`src/matcher.ts`、`src/regex.ts`。

## 1. 不回溯的匹配

NFA 允许多条路径同时存在，因此匹配时维护的是一个**活动状态集合**，而不是单条路径：

```
active: Map<NfaState, number>
```

value 是「到达该状态时，这条路径的起始位置」。保存起始位置是为了做子串搜索和最左最长判定。

每读一个码点：

1. 对 `active` 中每个状态，沿匹配该码点的字符边走到目标状态；
2. 目标状态继承原路径的起始位置；同一状态保留**更早**的起点；
3. 对新集合做 ε 闭包（同时处理 `^` / `$` 断言）；
4. 检查接受状态，更新最佳匹配。

整个过程是 `O(输入长度 × 状态数)`，没有回溯，也不会因为 `(a|aa)*` 这类模式指数爆炸。

## 2. find：最左最长

`find(nfa, input, fromIndex)` 的规则：

- **最左**：优先选择起始位置更小的匹配；
- **最长**：起点相同时，选择结束位置更大的匹配。

实现上不是「找到第一个就返回」，而是：

1. 在当前位置 `pos` 把 NFA 起点加入活动集合（只要还没有找到匹配）；
2. 每读一个码点后检查接受状态：
   - 如果没有最佳匹配，或当前路径起点更早，记录 `(start, pos)`；
   - 如果起点相同且 `pos` 更远，更新结束位置；
3. 一旦有了最佳起点 `bestStart`，丢弃所有起点更晚的路径；
4. 当没有任何「起点 ≤ bestStart」的路径还活着时停止。

这样既不会漏掉更长的匹配，也不会在找到匹配后继续无意义地扫描。

### 与 JavaScript 的差异

JavaScript 是「最左优先（leftmost-first）」：交替按书写顺序尝试，第一个成功即可。

```ts
new Regex('a|ab').exec('ab');   // { value: 'ab', ... }（最左最长）
'ab'.match(/a|ab/);             // 'a'（最左优先）
```

涉及交替顺序的测试不能直接拿 `RegExp` 的结果当预期。

## 3. 零宽断言

`^` 和 `$` 不消耗字符，只在 ε 闭包里求值：

```ts
function assertionHolds(assertion, input, pos, multiline): boolean
```

- `^`：`pos === 0`；多行模式下还允许前一个字符是行终止符。
- `$`：`pos === length`；多行模式下允许当前字符是行终止符；非多行模式下还额外允许「末尾换行符之前」的位置（与 JS 一致）。

因为断言依赖 `pos`，`closure` 每次推进后都要重新求值，不能像普通 ε 边那样预先算好。

## 4. testFull：整串匹配

`testFull` 不复用 `find`，而是固定从位置 0 开始、不重新播种：

- 读完全部输入后，只要活动集合里有接受状态就成功；
- 任意时刻活动集合为空则失败。

它等价于 `^(?:pattern)$`，但**不做**「末尾换行符之前」的特判，因此 `testFull('a\n')` 对 `a` 返回 false。需要 JS 风格时用 `find` + 锚点。

## 5. 空匹配与迭代

`findAll` / `replace` 通过 `iterateMatches` 生成器推进：

```ts
if (match.end > match.index) {
  cursor = match.end;                 // 非空匹配：直接跳过
} else {
  if (match.end >= input.length) return;
  cursor = match.end + codePointWidth; // 空匹配：前进一个码点
}
```

两个细节：

- 空匹配必须前进至少一个码点，否则 `a*` 在 `""` 上会死循环；
- 末尾允许最后一个空匹配，例如 `a*` 对 `"ba"` 得到 `["", "a", ""]`，与原生 `RegExp` 的 `matchAll` 行为一致。

## 6. Unicode

字符串下标是 UTF-16，但正则的「一个字符」应该是 Unicode 码点：

```ts
const cp = input.codePointAt(pos)!;
const width = cp > 0xffff ? 2 : 1;
```

- 字符集比较用码点；
- 活动集合推进按 `width`；
- 对外返回的 `index/end` 仍然是 UTF-16 下标，方便直接 `input.slice(index, end)`。

所以 `.` 匹配 `"😀"` 会得到 `index: 0, end: 2`。

## 7. 替换

`replace` 支持：

- 字符串模板：`$$` → 字面 `$`，`$&` → 整个匹配；
- 函数：`(match) => string`。

不实现 `$1` 捕获组替换，因为引擎本身没有捕获组。

## 8. 复杂度小结

| 操作 | 复杂度 |
| --- | --- |
| 单次 `find` | 最坏 `O(n × m)`，n 输入长度，m NFA 状态数 |
| `findAll` | 每次从上次结束处继续，整体近似 `O(n × m)` |
| DFA 整串判定 | `O(n)`，但构造可能指数级 |

这份实现优先选择「可理解、无回溯、内存可控」的 NFA 模拟；DFA 主要承担教学与可视化角色。
