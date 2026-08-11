# 智能参数提取金标集

- 字符区间使用 JavaScript UTF-16 offset，`end` 不包含末尾字符。
- `expected` 是应自动提交的高置信参数。
- `expectedUnknowns` 是应保留给用户或远程 AI 的内容。
- `mustNotExtract` 用于验证负向词、分类和标签元数据不会污染参数胶囊。
- `trustedParameters` 仅用于构造当前项目 `PromptLexiconSettings.parameters` 的可信词库场景。
