# 问题追踪器：本地 Markdown

此仓库的问题和 PRD 作为 Markdown 文件存储在 `.scratch/` 中。

## 约定

- 每个功能一个目录：`.scratch/<feature-slug>/`
- PRD 是 `.scratch/<feature-slug>/PRD.md`
- 实现问题是 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号
- 分类状态作为每个问题文件顶部的 `Status:` 行记录（参见 `triage-labels.md` 中的角色字符串）
- 评论和对话历史附加在文件底部的 `## 评论` 标题下

## 当技能说"发布到问题追踪器"时

在 `.scratch/<feature-slug>/` 下创建一个新文件（如果需要则创建目录）。

## 当技能说"获取相关问题"时

读取引用路径处的文件。用户通常直接传递路径或问题编号。
