export interface WelcomeDocumentSeed {
  name: string
  content: string
}

export const defaultMarkdownEN = `---
title: VisualMD Guide
author: PyroHao
description: Feature overview and onboarding guide for first-time users
---

# Welcome to VisualMD

VisualMD is a free, online, open-source visual editor for Markdown, inspired by everyday Markdown workflows. This update focuses on the feedback from the previous version and improves both capability and usability: image support, multiple layouts, prototype mode, live edit/preview, Git collaboration with conflict handling, and AI-powered document generation and rewriting. It now feels much closer to a complete Markdown workspace. Enjoy it!

## Quick Start

If you only want to understand the most important part of VisualMD first, remember these three flows:

- **Markdown -> Tree**: turn one Markdown document into an editable tree structure, so you can shape the structure before polishing the content.
- **AI -> Markdown**: tell AI what you want, let it generate a Markdown draft, then continue editing it yourself.
- **Markdown -> Git Commit**: move the final result directly into the Git workflow and turn writing into meaningful commits.

This is also the recommended path in the current version: write or generate Markdown first, organize it next, then push it into Git.

## What's New

The strongest part of this version is not a single isolated feature. It is the fact that **multi-layout editing, live preview, AI assistance, and Git collaboration** now work inside one workflow.

### 1. Multi-layout Editing

- **Mind Map mode**: best for building structure first, dragging levels around, and splitting content into sections.
- **Split mode**: write on the left, inspect the result on the right.
- **Prototype mode**: render Markdown into a lightweight page prototype when you need a quick UI sketch or demo.

These views all point to the same Markdown content, so you can switch freely without maintaining multiple copies.

### 2. Live Editing and Preview

- Mind map, source editing, and preview stay centered around the same content.
- It is built for changing structure while checking the final reading result at the same time.
- If your main task is writing, Split mode is usually the fastest entry point.

### 3. AI Assistance

- You can configure multiple AI providers and use your own models and endpoints.
- You can generate a document draft from a single sentence.
- You can select a passage and press **Ctrl + L** to ask AI to explain, rewrite, expand, or polish it.
- If Git is already configured, AI-generated documents can continue directly into the Git workflow.

### 4. Git Collaboration

- The current main workflow supports **GitHub** and **Gitee**.
- You can connect a repository, browse files, edit Markdown, and commit changes directly.
- It supports draft caching, staging, remote refresh, conflict detection, and conflict handling.
- When a remote conflict is detected, VisualMD keeps your local draft and opens a conflict resolution view for review.

### 5. Image Support

- Local documents and Git documents both support direct image paste.
- Local workspace images are stored in the system asset directory and referenced through Markdown image syntax.
- Local images can also be exported to the browser local machine.
- Important: **if you add a local Markdown file to Git and it references local asset paths, those images will not be added to Git automatically.**

## Recommended First Workflow

1. Create or open a Markdown document.
2. Start in **Mind Map mode** to shape the structure, then switch to **Split mode** to check the reading result.
3. Use AI when you need drafting, rewriting, or explanation.
4. Configure GitHub or Gitee when you are ready for collaboration or version control.
5. Only switch to Prototype mode when you actually need a page sketch and want to add \`@proto\` commands.

## Prototype Syntax

Prototype mode is a supporting capability, not the main highlight of this release. Use it when you already have Markdown content and want to quickly add some UI and interaction flavor.

You only need to remember one rule: **write normal Markdown, and insert \`@proto\` commands where you need UI controls.**

### Supported Definitions

- \`@proto input label="" placeholder="" type=""\`: single-line input
- \`@proto textarea label="" placeholder=""\`: multi-line input
- \`@proto button text="" action="" intent="primary|secondary" goto="" target="" dialog=""\`: button
- \`@proto toggle label="" checked="true|false"\`: switch
- \`@proto tabs items="A|B|C"\`: tabs
- \`@proto card title="" description=""\` or \`desc=""\`: info card
- \`@proto stat label="" value=""\`: stat block
- \`@proto note text=""\` or \`content=""\`: note block

Besides these commands, Prototype mode also supports normal Markdown content including paragraphs, blockquotes, ordered and unordered lists, checklists, tables, fenced code blocks, and inline bold, italic, code, and images.

### Prototype Example

\`\`\`md
# Account Center

This page prototype demonstrates a login and registration flow.

@proto tabs items="Login|Register"
@proto card title="Welcome back" description="Sign in with your account and continue to your workspace"
@proto input label="Email" placeholder="name@example.com" type="email"
@proto input label="Password" placeholder="Enter your password" type="password"
@proto toggle label="Remember me" checked="true"
@proto button text="Sign In" action="login" intent="primary"
@proto button text="Forgot Password" intent="secondary" goto="Password Recovery"

> New users can switch to the "Register" tab to create an account.

@proto card title="Create a new account" description="After registration, you can sync documents, prototypes, and your Git workspace"
@proto input label="Username" placeholder="Enter a username"
@proto input label="Registration Email" placeholder="register@example.com" type="email"
@proto input label="Set Password" placeholder="At least 8 characters" type="password"
@proto input label="Confirm Password" placeholder="Enter the password again" type="password"
@proto toggle label="Agree to the Terms and Privacy Policy" checked="false"
@proto button text="Register and Start" action="register" intent="primary"

- [ ] Complete email verification
- [ ] Add third-party login options

| Section | Description |
| --- | --- |
| Login Form | Supports account and password sign-in |
| Registration Form | Supports new account creation |
\`\`\`

## Git Usage

Git is one of the core capabilities of the current system. If you want your documents to be part of real collaboration and version control, configure it early.

### What You Need

- Platform type: **GitHub** or **Gitee**
- PAT / Token
- \`owner\` or namespace
- Repository name
- Branch name

### PAT Permission Advice

Make sure the token has at least read and write access to repository contents, otherwise both connection and later commits may fail.

- **GitHub**: in most cases you need read/write access for \`Contents\`.
- **Gitee**: you also need repository read/write style permissions that cover repository access and push operations.

### If Connection Fails, Check These First

In the current system, Git providers often return **404** when the repository is not found, the branch is wrong, or permissions are insufficient. If connection does not succeed, check these first:

1. Whether the PAT is incorrect, expired, or missing permissions.
2. Whether the selected platform is wrong, for example GitHub vs Gitee.
3. Whether \`owner\`, repository name, or branch name is misspelled.
4. Whether the repository is accessible with the current token.

## AI Usage

AI is also one of the key capabilities in this release. It works best as a document accelerator, not as a standalone chat box.

### Typical Uses

- Describe what you want and let AI generate a new Markdown document.
- Continue, expand, rewrite, or polish the current document.
- Ask AI to explain, summarize, or restructure a selected passage.

### Selection Workflow

1. Select a passage in the editor or preview.
2. Press **Ctrl + L**.
3. The selection is added into the AI conversation context.
4. Enter your request, such as "Explain this section", "Rewrite this in a more formal tone", or "Expand this into a product description".

### Git Handoff

If Git is already configured, AI-generated documents can continue into the Git workflow after confirmation, so they can be managed like normal versioned content.

## Images and Assets

### Local Documents

- You can paste images directly.
- The system stores local workspace assets for you and writes image links into Markdown.
- When exporting a single local document, VisualMD automatically decides whether to export a plain \`.md\` file or a package that includes its assets.

### Git Documents

- Git documents also support image paste and image references.
- But local asset paths and Git repository assets are not the same source of truth.

### Important Limitation

If a local Markdown document references local asset images, adding that Markdown file to Git does not automatically add those images to the repository. To commit them, make sure the images have entered the repository-side asset path through the Git workflow.

## Practical Notes

- The welcome documents are created only once on the first workspace load. If you delete them later, they will not be recreated automatically.
- If your main task is content structure, start with Mind Map mode. If you need a quick UI sketch, then switch to Prototype mode.
- If you see a Git conflict prompt, resolve the conflict first before refreshing the repository or continuing to commit.
- If images render correctly in preview but are missing in Git, the problem is usually not rendering. It usually means the assets never actually entered the repository.
`

export const defaultMarkdownCN = `---
title: VisualMD 使用说明
author: PyroHao
description: 首次使用时的功能总览与操作提示
---

# 欢迎使用 VisualMD

[VisualMD](https://github.com/pyrohao/VisualMD) 是一个免费、在线、开源的 Markdown 可视化编辑器，灵感源于日常中对 Markdown 的使用。本次更新针对上个版本大家的反馈和建议，着重增强了功能和使用体验！新增图片支持、多布局切换、原型模式、实时编辑预览、Git 协作与冲突解决、AI 文档生成与修改。现在，它更像一个完整 md 的工作台了！Enjoy it!

## 快速开始

- **Markdown → Tree**：把一篇 Markdown 直接转换成可编辑的树结构，先搭结构，再补内容。
- **AI → Markdown**：直接告诉 AI 你要写或改什么，让它编辑 Markdown ，再继续人工修改。
- **Markdown → Git Commit**：把写作、改写、整理后的结果推进 Git，形成提交与版本管理。

## 新功能

先看重点，这一版最值得用的不是某一个单点功能，而是把 **多布局编辑、实时预览、AI 辅助、Git 协作** 放进了同一条工作流里。

### 1. 多布局支持

- 支持单侧、两侧、上下共四种布局，可灵活切换适应不同的使用场景。

这几个视图对应的是同一份 Markdown 内容，可以随时切换，不需要维护多份文档。

### 2. 实时编辑与预览

- 脑图、原型、预览会围绕同一份内容同步更新。
- 适合一边改结构，一边看最终阅读效果。
- 如果你主要是写文档，分栏模式通常是最顺手的入口。

### 3. AI 辅助

- 支持配置多个 AI 源，按自己的模型和接口使用。
- 可以一句话生成文档初稿。
- 可以选中文档片段后按 **Ctrl + L**，让 AI 解释、改写、扩写、润色。
- 如果当前已配置 Git，AI 生成的新文档还可以继续进入 Git 流程。

### 4. Git 协作

- 当前主流程支持 **GitHub** 与 **Gitee**。
- 可以直接连接仓库、浏览文件、编辑 Markdown、提交改动。
- 支持草稿缓存、暂存、刷新远端、冲突检测与冲突处理。
- 检测到远端冲突后，系统会保留本地草稿，并进入冲突处理视图供你确认结果。

### 5. 图片支持

- 本地与 Git 文档支持直接粘贴图片或嵌入图片链接。
- 本地工作区图片会写入系统资源目录，并通过 Markdown 图片语法引用。
- 本地图片支持单独导出到浏览器本地。
- 需要注意：**如果你把本地 Markdown 文件加入 Git，而文中引用的是本地资源路径，对应图片不会自动一起加入 Git。**

## Git 使用说明

Git 是当前系统的重点能力之一。如果你希望把文档真正纳入协作和版本管理，建议尽早配好。

### 你需要准备什么

- 平台类型：**GitHub** 或 **Gitee**
- PAT / Token
- \`owner\` 或命名空间
- 仓库名
- 分支名

### PAT 权限建议

请确保令牌至少具备仓库内容的读取与写入权限，否则连接和提交都会失败。

- **GitHub**：通常需要 \`Contents\` 相关的读写权限。
- **Gitee**：同样需要仓库读写类权限，至少覆盖读取仓库与推送内容所需范围。

### 连接失败时先查这几项

当前系统里，Git 提供商在仓库未命中、分支错误或权限不足时，常会返回 **404**。如果连接没有成功，优先检查：

1. PAT 是否填错、过期或权限不足。
2. 平台是否选错，例如 GitHub / Gitee 选反。
3. \`owner\`、仓库名、分支名是否拼写错误。
4. 仓库是否为当前令牌可访问的仓库。

## AI 使用说明

AI 也是当前版本的重点能力，建议把它当成“文档加速器”来用，而不是单独聊天工具。

### 典型用法

- 直接描述需求，让 AI 生成一篇新的 Markdown 文档。
- 对当前文档进行续写、扩写、改写、润色。
- 对选中的片段做解释、总结或结构化整理。

### 选区工作流

1. 在编辑区或预览区选择一段内容。
2. 使用 **Ctrl + L**。
3. 选区会进入 AI 对话上下文。
4. 输入你的要求，例如“解释这段内容”“改成更正式的语气”“扩写为产品说明”。

### 与 Git 联动

如果当前 Git 已配置完成，AI 生成的新文档在确认后可以继续进入 Git 流程，便于直接纳入版本管理。

## 图片与资源说明

### 本地文档

- 可以直接粘贴图片。
- 系统会为本地工作区维护资源文件，并在 Markdown 中写入图片链接。
- 导出单篇本地文档时，如果文中引用了本地资源，系统会自动判断导出为 \`.md\` 或包含资源的压缩包。

### Git 文档

- Git 文档同样支持图片粘贴与引用。
- 但本地资源路径与 Git 仓库资源并不是同一套来源。

### 需要特别注意

如果一篇本地 Markdown 文档中引用的是本地资源图片，即使你把这篇文档添加到 Git，图片本身也不会自动一起加入仓库。要提交这类图片，请确保它们已经按 Git 工作流进入仓库侧资源路径。

## 原型语法

原型模式是一个补充能力，不是当前版本的主亮点。它适合在已有 Markdown 内容里，快速补一点页面感和交互感。

你只需要记住一句话：**正常写 Markdown，在需要控件的地方插入 \`@proto\` 指令即可。**

### 当前支持的定义

- \`@proto input label="" placeholder="" type=""\`：单行输入框
- \`@proto textarea label="" placeholder=""\`：多行输入框
- \`@proto button text="" action="" intent="primary|secondary" goto="" target="" dialog=""\`：按钮
- \`@proto toggle label="" checked="true|false"\`：开关
- \`@proto tabs items="A|B|C"\`：标签页
- \`@proto card title="" description=""\` 或 \`desc=""\`：信息卡片
- \`@proto stat label="" value=""\`：统计块
- \`@proto note text=""\` 或 \`content=""\`：说明块

除了这些指令，原型模式也支持普通 Markdown 内容，包括：段落、引用块、有序/无序列表、任务清单、表格、围栏代码块，以及行内粗体、斜体、代码、图片。

### 原型示例

\`\`\`md
# 账号中心

这是一个用于演示登录与注册流程的页面原型。

@proto tabs items="登录|注册"
@proto card title="欢迎回来" description="使用账号密码登录，继续访问你的工作区"
@proto input label="邮箱" placeholder="name@example.com" type="email"
@proto input label="密码" placeholder="请输入密码" type="password"
@proto toggle label="记住我" checked="true"
@proto button text="立即登录" action="login" intent="primary"
@proto button text="忘记密码" intent="secondary" goto="找回密码"

> 新用户可以切换到“注册”标签页创建账号。

@proto card title="创建新账号" description="注册后即可同步文档、原型与 Git 工作区"
@proto input label="用户名" placeholder="请输入用户名"
@proto input label="注册邮箱" placeholder="register@example.com" type="email"
@proto input label="设置密码" placeholder="至少 8 位" type="password"
@proto input label="确认密码" placeholder="请再次输入密码" type="password"
@proto toggle label="同意用户协议与隐私政策" checked="false"
@proto button text="注册并开始使用" action="register" intent="primary"

- [ ] 完成邮箱验证码
- [ ] 补充第三方登录入口

| 页面区块 | 说明 |
| --- | --- |
| 登录表单 | 支持账号密码登录 |
| 注册表单 | 支持创建新账号 |
\`\`\`

## 其他实用提示

- 欢迎文档只会在首次加载工作区时自动创建一次，后续删除不会再次自动恢复。
- 如果你主要做结构整理，优先使用脑图模式；如果要做展示或交互草图，优先切换到原型模式。
- 如果你在 Git 模式下看到冲突提示，先处理冲突，再刷新仓库或继续提交。
- 如果预览中图片正常，而 Git 中缺图，通常不是渲染问题，而是资源并未真正进入仓库。

`

export const DEFAULT_WELCOME_DOCUMENTS: ReadonlyArray<WelcomeDocumentSeed> = [
  {
    name: 'Welcome.md',
    content: defaultMarkdownEN,
  },
  {
    name: '欢迎使用.md',
    content: defaultMarkdownCN,
  },
]
