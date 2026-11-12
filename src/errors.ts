/** 正则表达式语法错误，带出错位置（以码点序号计）。 */
export class RegexSyntaxError extends Error {
  readonly pattern: string;
  readonly position: number;
  readonly subject?: string;

  constructor(message: string, pattern: string, position: number, subject?: string) {
    const cursor = `${pattern}\n${' '.repeat(position)}^`;
    super(`${message}\n${cursor}${subject === undefined ? '' : `\n${subject}`}`);
    this.name = 'RegexSyntaxError';
    this.pattern = pattern;
    this.position = position;
    if (subject !== undefined) {
      this.subject = subject;
    }
  }
}

/** 合法语法但无法构造自动机（例如展开次数超过上限）。 */
export class RegexCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegexCompileError';
  }
}
