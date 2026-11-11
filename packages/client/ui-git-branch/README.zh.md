---
description: "会话标题旁的 Git 分支标签及其分支切换器，底层是读取会话工作目录检出状态的 Host git Remote。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-git-branch

[English](README.md) | 中文

## 摘要

`dsh-client-ui-git-branch` 在会话标题旁显示会话工作目录当前检出的分支，并可通过标签的菜单切换分支。该包包含两个面：浏览器面注册一个标题栏操作及其词典，Host 面提供生成的 `git` Remote 命名空间，用于读取分支位置、列出本地分支并在会话的沙箱策略下检出一个分支。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

通过 web-app 清单加载该插件。在 Git 检出之外它不渲染任何内容，因此普通目录中的会话不会多出一个分支控件。

标签显示当前检出的分支，并打开本地分支菜单，当前分支排在首位并高亮。选择其他分支会在会话的有效工作目录中运行 `git switch`；标签随即显示新名称，被拒绝的切换会留在菜单中并给出本地化原因与 Git 自己的诊断。分离头指针时标签显示缩写提交号，菜单仍提供全部本地分支。

会话或其工作目录变化时、以及每次打开菜单时，标签都会重新读取分支位置。后台不做轮询，因此在该控件之外切换的分支会在下次打开菜单时更新。

### 配置

Host 面从插件条目读取 Git 可执行文件与进程限制：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `gitCommand` | `git` | Git 可执行文件名或绝对路径 |
| `timeoutMs` | `10000` | 单条命令的超时毫秒数 |
| `graceMs` | `2000` | 每个进程的终止宽限毫秒数 |
| `maxOutputBytes` | `65536` | 每个输出流保留的最大字节数 |
| `maxBranches` | `200` | 菜单一次列出的本地分支上限 |

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现内部细节 — 点击展开</summary>

浏览器面注册一个 `conversation.session.header.actions` 条目，顺序为 `0`，位于智能体预设标签的前置区之后、后台任务列表之前。组件只使用槽位的标准会话席位：分支位置与分支列表都通过注入面发起一次性 Remote 读取，打开菜单时刷新。

Host 面是一个 `TypertRemoteService`，绑定到 `ctx.gitController` 与生成的 `git` 命名空间。每条命令都在 `ctx.workingDirectory.get(session)` 报告的目录中经 `ctx.subprocess` 运行；除 `danger-full-access` 外，均按 `ctx.sandboxPolicy.resolve({ session })` 与 `ctx.sandbox.confine` 约束。运行器清除继承的仓库选择变量，禁用提示、钩子、可选索引写入与文件系统监视，并以 `timeoutMs` 与 `maxOutputBytes` 限制每条命令。

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | Host `git` Remote 服务及其配置 |
| [`src/git.ts`](src/git.ts) | Git 调用、输出解析与拒绝分类 |
| [`src/types.ts`](src/types.ts) | `git` 命名空间的客户端安全线缆类型 |
| [`src/client/index.ts`](src/client/index.ts) | 槽位注册、词典与 Remote 结果解包 |
| [`src/client/GitBranchAction.tsx`](src/client/GitBranchAction.tsx) | 标签、菜单与切换反馈 |
| [`src/client/locales.ts`](src/client/locales.ts) | `gitBranch` 命名空间文案（以中文为准） |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [`dsh-api-gateway`](../../../docs/api-gateway.zh.md) — `ctx.remote.git` 背后的 Remote 模型、生成流程与调用。
- [`dsh-sandbox-policy`](../../sandbox/sandbox-policy/README.zh.md) — 会话的文件效果策略如何解析。
- [`dsh-working-directory`](../../session/working-directory/README.zh.md) — 标签所报告的有效目录。

-----

<a id="model-experience"></a>
## 模型体验

无。本包为人类读取仓库状态，不涉及提示、消息、模式、流或工具结果。

#### KV 缓存影响

无；本包从不组装或发送提供商请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明当前的包约束，不是任务清单。

- **没有后台刷新** — 在该控件之外切换的分支只会在下次打开菜单或会话变化时更新，因为本包不轮询仓库状态。
- **不含 fetch 或远程分支** — 菜单只列出本地分支；拉取、创建和删除分支不在该控件范围内。
- **未提交的修改会阻止切换** — Git 拒绝检出并给出提示；本包不会替用户暂存或丢弃工作。