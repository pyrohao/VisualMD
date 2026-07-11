---
title: VisualMD 使用指南
author: PyroHao
description: 首次使用的快速上手、功能导览与配置手册
---

# 欢迎使用 VisualMD

[VisualMD](https://github.com/pyrohao/VisualMD) 是一个免费、在线、开源的 Markdown 可视化工作台。它把 **Markdown 写作、结构整理、实时预览、AI 协作、Git 版本管理** 收进同一个浏览器工作流里，适合技术文档、产品方案、知识库、Prompt 文档、学习笔记这类需要长期迭代的内容。

```text
VisualMD = Markdown 编辑器 + 文档结构画布 + AI 协作面板 + Git 工作区
```

## 快速了解

- **先组织结构，再补内容**：Markdown 标题可以直接转换成可编辑的树形结构，适合长文档规划。
- **同一份内容多视图联动**：源码、预览、Live、Split、Prototype 围绕同一份 Markdown 同步工作。
- **AI 不再是外部聊天窗口**：你可以直接基于当前文档片段解释、改写、扩写、润色。
- **Git 工作流内置**：支持连接 GitHub / Gitee，直接浏览、编辑、提交、处理冲突。
- **不锁定私有格式**：底层仍然是标准 Markdown，文档可以继续导出到其他工具中使用。

## 快速开始

1. 新建一篇 Markdown 文档，或导入已有 Markdown。
2. 先用 `Markdown → Tree` 把标题结构展开成树，调整章节顺序与层级。
3. 需要润色时，选中文本后按 **Ctrl + L**，把片段送进 AI 上下文。
4. 需要预览时，切到 `Live`、`Split` 或 `Prototype` 视图查看效果。
5. 如果你已经配置 Git，就可以继续提交、暂存、同步和处理冲突。

---

## 核心功能速览

### 1. 主题切换与阅读体验

![主题切换演示](https://raw.githubusercontent.com/pyrohao/VisualMD/main/public/assets/screenshots/Theme_Switch_Demo.gif)

> 主题切换演示：编辑、预览和阅读可以按场景切换。

- 内置多套主题，适合日间编辑、夜间写作、长文阅读与校对。
- 主题会影响编辑区、预览区和整体界面，不只是简单换背景色。
- 如果你要长时间阅读文档，建议优先切换到更偏阅读取向的主题。

### 2. AI + Git 一体化工作流

![AI 与 Git 版本工作流演示](https://raw.githubusercontent.com/pyrohao/VisualMD/main/public/assets/screenshots/AI_Git_VersionControl_Demo.gif)

> AI 与 Git 不再分散在不同工具里，而是围绕同一份文档连续工作。

- 你可以在浏览器里同时处理文档结构、Markdown 正文、AI 对话和 Git 版本管理。
- 当前主流程支持 **GitHub** 与 **Gitee**。
- 支持草稿缓存、暂存、远端刷新、冲突检测与冲突处理。
- AI 生成的新文档或改写结果，在确认后可以继续进入 Git 工作流。

适合的典型链路是：

1. 先搭 Markdown 结构。
2. 让 AI 补初稿、续写或润色。
3. 人工复核并继续修改。
4. 提交到 Git，作为版本化知识资产持续维护。

### 3. 实时编辑、预览与 Prototype 联动

![Prototype 实时编辑演示](https://raw.githubusercontent.com/pyrohao/VisualMD/main/public/assets/screenshots/Prototype_RealTime_Editing_Demo.gif)

> 同一份 Markdown 可以在文本、结构、预览、原型之间来回切换。

- Markdown 标题会展开成可视化结构树，适合先搭框架，再逐章补内容。
- 支持批量创建子节点、拖拽重组、节点断开与重连，降低长文结构调整成本。
- 同一份内容可在 `文本`、`预览`、`Live`、`Split`、`Prototype` 视图之间联动切换。
- 支持 `@proto` 指令，把文档直接派生为低成本交互原型。
- Markdown 预览支持图片、Mermaid、数学公式，并默认做 HTML 白名单清洗。

### 4. 文档大纲侧边栏

![文档大纲侧边栏演示](https://raw.githubusercontent.com/pyrohao/VisualMD/main/public/assets/screenshots/Document_Outline_Sidebar_Demo.gif)

> 长文档不必只靠滚动定位，可以直接按标题结构跳转。

- 实时提取当前 Markdown 的标题层级，长文结构一眼可见。
- 点击大纲即可跳转到对应内容位置。
- 对技术文档、设计文档、知识库、Prompt 文档这类长内容尤其有价值。

---

## 常见使用方式

### 写长文档或知识库

- 先用脑图或树结构规划全文，再回到正文逐段补写。
- 当结构变更频繁时，优先在结构视图里调整，比直接在源码里剪切粘贴更高效。
- 如果文档最终还要进入版本管理，建议从一开始就使用明确的标题层级。

### 用 AI 做解释、改写、续写

1. 在编辑区或预览区选择一段内容。
2. 按 **Ctrl + L**。
3. 选区会进入 AI 对话上下文。
4. 输入你的要求，例如：
   - “解释这段内容”
   - “改成更正式的语气”
   - “扩写为产品说明”
   - “帮我补一节总结”

更适合把 AI 当成“文档加速器”，而不是脱离上下文的单独聊天窗口。

### 用 Git 管理 Markdown 资产

- 在线浏览仓库目录树。
- 直接编辑仓库内 Markdown 文件。
- 文本与图片资产可统一暂存、批量提交。
- 发生冲突时，优先先处理冲突，再继续刷新或提交。

### 图片与资源处理

#### 本地文档

- 支持直接粘贴图片。
- 系统会为本地工作区维护资源文件，并在 Markdown 中写入图片链接。
- 导出单篇本地文档时，如果文中引用了本地资源，系统会自动判断导出为 `.md` 或包含资源的压缩包。

#### Git 文档

- Git 文档同样支持图片粘贴与引用。
- 但本地资源路径与 Git 仓库资源不是同一套来源。

#### 需要特别注意

如果一篇本地 Markdown 文档中引用的是本地资源图片，即使你把这篇文档添加到 Git，图片本身也不会自动一起加入仓库。要提交这类图片，请确保它们已经按 Git 工作流进入仓库侧资源路径。

---

## Git 配置指南

VisualMD 默认开箱即用；如果你要连接仓库并使用提交、同步、冲突处理等能力，需要先准备 **PAT / Token**。

### 当前支持的平台

- `GitHub`
- `Gitee`

### 在 Git 设置里需要填写

- `Provider`：选择 `GitHub` 或 `Gitee`
- `Token`：你的 PAT / 访问令牌
- `owner / group`：用户名、组织名或命名空间
- `repo`：仓库名
- `branch`：分支名，例如 `main`

### GitHub 的配置方法

推荐使用细粒度令牌，而不是经典令牌：**Fine-grained personal access token**

1. 打开 [github-personal-access-tokens](https://github.com/settings/personal-access-tokens)
2. 进入 `Fine-grained tokens`
3. 创建新的 token
4. 选择你要访问的账号或组织，以及目标仓库
5. 给目标仓库的 `Contents` 分配读写权限

如果你的组织对 token 有额外限制，可能还需要组织管理员放行。

### Gitee 的配置方法

1. 登录 Gitee
2. 打开个人设置中的令牌页面
3. 创建新的访问令牌
4. 给它分配能覆盖仓库访问与推送的权限

推荐入口：[gitee-personal_access_tokens](https://gitee.com/profile/personal_access_tokens)

建议至少确保：

- 能读取目标仓库内容
- 能向目标仓库写入或推送内容

### 连接失败时优先检查

如果仓库连接失败，最常见的不是程序问题，而是配置问题：

1. `Provider` 是否选对了，`GitHub` 和 `Gitee` 不能混用。
2. `Token` 是否填错、过期或权限不足。
3. `owner / group`、`repo`、`branch` 是否拼写错误。
4. 当前 token 是否真的有权访问该仓库。

### Git Token 安全注意事项

- 优先给最小必要权限，不要为了省事直接给全权限。
- 尽量只授权需要的仓库，不要默认放开全部私有仓库。
- 如果怀疑泄露，立即去 GitHub / Gitee 后台撤销旧 token 并重新生成。
- 当前项目会把 token 保存在浏览器本地，并做本地加密 / 混淆处理；这能降低误暴露风险，但不等于服务端级密钥托管，因此仍应避免在不可信设备上长期保存高权限 token。

---

## AI 配置指南

VisualMD 的 AI 能力采用“自带模型通道”的方式工作。要启用 AI，需要在 AI 设置面板中准备并填写：

- `API Base URL`
- `API Key`
- `Model`

### 当前支持

- `OpenAI-compatible`
- `Anthropic-compatible`

并内置了多种预设通道，例如 OpenAI、Anthropic、OpenRouter、SiliconFlow、通义、火山方舟、智谱等。你也可以手动填写自定义兼容接口。

### AI 的配置方法

1. 打开 AI 设置面板
2. 选择一个预设 provider，或新建自定义 provider
3. 填写 `API Base URL`
4. 填写 `API Key`
5. 选择或刷新 `Model`
6. 点击 `测试连接`

如果模型列表可以自动读取，也可以先填好 `API Base URL` 和 `API Key`，再刷新模型列表。

### AI Key 安全注意事项

- 优先使用具有额度管控或免费的 `API Key`。
- 如果怀疑泄露，第一时间去对应平台撤销旧 key 并重新生成。
- 如果你非常在意密钥暴露风险，更稳妥的方案是通过你自己的后端或代理层转发，而不是把高敏感 key 直接输入前端页面。
- 当前项目会把 AI Key 保存在浏览器本地，并做本地加密 / 混淆处理；它适合个人自带 key 的使用方式，但不应被理解为企业级密钥保险箱。

---

## Prototype 快速参考

Prototype 模式适合在已有 Markdown 内容上，快速加一点页面感和交互感。核心规则只有一句：

**正常写 Markdown，在需要控件的地方插入 `@proto` 指令即可。**

### 当前支持的常见指令

- `@proto input label="" placeholder="" type=""`：单行输入框
- `@proto textarea label="" placeholder=""`：多行输入框
- `@proto button text="" action="" intent="primary|secondary" goto="" target="" dialog=""`：按钮
- `@proto toggle label="" checked="true|false"`：开关
- `@proto tabs items="A|B|C"`：标签页
- `@proto card title="" description=""` 或 `desc=""`：信息卡片
- `@proto stat label="" value=""`：统计块
- `@proto note text=""` 或 `content=""`：说明块

### 一个最小示例

```md
### 登录页

@proto card title="欢迎回来" description="登录后继续访问工作区"
@proto input label="邮箱" placeholder="name@example.com" type="email"
@proto input label="密码" placeholder="请输入密码" type="password"
@proto toggle label="记住我" checked="true"
@proto button text="立即登录" action="login" intent="primary"
```

除了这些指令，Prototype 模式同样支持普通 Markdown 内容，包括段落、引用块、列表、任务清单、表格、围栏代码块，以及行内粗体、斜体、代码、链接和图片。

---

## 其他实用提示

- 欢迎文档只会在首次加载工作区时自动创建一次，后续删除不会再次自动恢复。
- 如果你主要做结构整理，优先使用脑图模式；如果要做展示或交互草图，优先切换到 Prototype 模式。
- 如果你在 Git 模式下看到冲突提示，先处理冲突，再刷新仓库或继续提交。
- 如果预览中图片正常，而 Git 中缺图，通常不是渲染问题，而是资源并未真正进入仓库。
- 云端、Git、AI 都是可选扩展能力；如果你只想本地写 Markdown，也可以单独使用基础编辑能力。
