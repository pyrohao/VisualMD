# VisualMD · Markdown 知识创作工作台

<p align="center">
  <img src="./public/apple-icon.png" alt="VisualMD" width="120">
</p>

<p align="center">
  <strong>Think visually. Write in Markdown. Version everything.</strong>
</p>
<p align="center">
  可视化搭建结构 · Markdown 原生创作 · AI 辅助 · Git 管理，浏览器完成完整知识生产流程
</p>


<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#为什么选择-visualmd">为什么选择 VisualMD</a> ·
  <a href="#ai--git">AI & Git</a> ·
  <a href="#高级配置">高级配置</a> ·
  <a href="#本地开发与运行">本地开发与运行</a>
</p>

<p align="center">
  <img alt="Markdown" src="https://img.shields.io/badge/Markdown-Local%20First-2563eb">
  <img alt="Pure Frontend" src="https://img.shields.io/badge/Pure-Frontend-8b5cf6">
  <img alt="Free Forever" src="https://img.shields.io/badge/100%25-Free-22c55e">
  <img alt="AI" src="https://img.shields.io/badge/AI-Document%20Aware-0ea5e9">
  <img alt="Git" src="https://img.shields.io/badge/Git-Integrated-f97316">
  <img alt="Open Source" src="https://img.shields.io/badge/License-Apache--2.0-4f46e5">
</p>

<p align="center">
  <strong>中文</strong> | <a href="./README.en.md">English</a>
</p>

---

## 快速开始
无需安装注册，访问即用：
[VisualMD](https://genfor.me/)

如需二次开发、私有化部署、自定义功能，跳转文末 [本地开发与运行](#本地开发与运行)。

<p align="center">
  <img src="public/assets/screenshots/Theme_Switch_Demo.gif" alt="主题切换演示" width="100%">
</p>

> 三种主题模式，适配编辑、预览和阅读场景，降低长时间编辑时的视觉疲劳。


## 不只是 Markdown 编辑器
### 1. AI + Git 嵌入
<p align="center">
  <img src="public/assets/screenshots/AI_Git_VersionControl_Demo.gif" alt="AI 与 Git 版本工作流演示" width="100%">
</p>
VisualMD 将多类工具能力整合在浏览器单一工作空间，统一承载：

- 可视化树形文档结构
- 标准 Markdown 原生编辑
- 上下文联动 AI 文档协作
- 轻量化 Git 版本管理
- 图片、Mermaid、公式统一资产管控

告别多软件来回切换：
```
VisualMD = Markdown编辑器 + 思维导图 + AI对话窗口 + Git管理
```

### 2. 实时编辑

<p align="center">
  <img src="public/assets/screenshots/Prototype_RealTime_Editing_Demo.gif" alt="Prototype 实时编辑演示" width="100%">
</p>

- 把 Markdown 标题层级展开成可视化结构树，适合先搭框架，再逐章补内容。
- 支持批量创建子节点、拖拽重组、节点断开与重连，显著降低长文结构调整成本。
- 同一份文档可在文本、预览、Live、Prototype、Split 视图之间联动切换。
- 支持 `@proto` 指令把文档直接派生为可交互原型，减少“文档一份、草图一份”的重复维护。
- Markdown 预览支持图片、Mermaid、数学公式，并默认做 HTML 白名单清洗。

### 3. 文档大纲侧边栏

<p align="center">
  <img src="public/assets/screenshots/Document_Outline_Sidebar_Demo.gif" alt="文档大纲侧边栏演示" width="100%">
</p>

- 实时提取当前 Markdown 的标题层级，长文结构一眼可见。
- 点击大纲即可跳转到对应内容位置，不再依赖纯源码滚动定位。
- 调整画布节点序号快速组织同级标题内容。
- 对技术文档、设计文档、知识库、Prompt 文档这类长内容尤其有价值。

---

## 为什么选择 VisualMD
### 先组织结构，再填充内容
撰写长文档、知识库时，最大损耗并非打字，而是反复调整章节结构。
VisualMD 自动将 Markdown 标题转为可视化可操作文档树，支持：
- 批量批量创建章节节点
- 全局俯视规划全文逻辑
- 框架定型后再逐段完善正文

适配场景：技术文档、产品方案、系统学习笔记、学术研究报告、长篇专栏文稿。

### AI 深度嵌入文档，而非独立聊天窗口
传统AI使用流程割裂繁琐：
```
打开AI网页 → 复制粘贴文档片段 → 等待生成 → 复制内容切回编辑器
```

VisualMD 原生内嵌AI编辑链路：
```
当前文档 → 选中段落 → AI读取 → 辅助修改
```

AI Copilot 支持能力：
- 内容扩写、精简润色
- 全文/段落改写、文风调整
- 文章逻辑结构优化
- 内容漏洞审查校对
- 一键生成全新章节

所有AI修改全程可控：
- 支持一键撤销全部自动改动
- 修改内容先预览确认，不会静默覆盖原文

### Git! 把知识资产像代码一样维护
项目README、技术手册、产品PRD、设计规范、知识库均以Markdown存储，天然适配Git版本体系。
VisualMD 内置完整Git工作流，无需额外客户端：
- 在线浏览远程仓库目录树
- 直接编辑仓库内Markdown文件
- 粘贴图片自动生成标准资源路径
- 文本与图片资产统一暂存、批量提交
- 三栏可视化冲突检测与合并处理

文档不再是孤立文件，而是可长期迭代、可多人协作的标准化知识资产。

### 本地优先，完整掌握内容控制权
VisualMD 不制造私有文档格式绑架用户，你的内容永久具备完整迁移能力：
- 底层为标准原生Markdown，无自定义私有语法
- 文档、图片、模板、配置全部本地存储
- 导出文件自动附带全部引用图片，无缝兼容 Typora / VS Code / Obsidian
- 随时完整导出、离线备份

云端、Git、AI均为可选扩展能力，不强制绑定账号、不强制上传内容。


### 核心能力
#### 文档结构可视化
自动解析标题层级生成交互式文档树：

- 批量新增、删除子节点
- 结构变更实时同步至Markdown源码
将传统线性写作，升级为先规划结构、后填充内容的结构化创作模式。

#### 多模式文档实时联动
同一份Markdown文档，多视图一键切换，数据实时互通：
- 源码编辑模式
- Live 实时预览模式
- Prototype 低保真原型模式（@proto指令快速生成交互草图）
- Split 分栏对照模式

无需维护多份重复文档，一套内容满足编辑、预览、原型设计全部需求。

#### 配套基础能力
1. 三套主题切换：适配日间编辑、夜间写作、长文校对；
2. 侧边栏全局大纲：自动提取H1-H6标题，点击快速跳转段落；
3. 原生渲染Mermaid流程图、数学公式、图片，导出预览效果统一；
4. HTML内容安全清洗，规避XSS风险。

## AI & Git
### AI 能力清单
1. 支持选中标题、段落、代码块、表格、图片片段定向对话；
2. AI会话绑定原文快照，全程理解当前文档完整逻辑；
3. 所有改写操作提供预览确认，不会直接覆盖正文；
4. AI新建文档默认保存在本地，由用户自主选择是否纳入Git版本；
5. 兼容全部OpenAI规范接口，可自由切换第三方AI服务商。

### Git 能力清单
- 远端拉取刷新，本地草稿独立保留不丢失；
- 冲突检测 + 本地/合并/远端三栏可视化解决；
- 草稿、图片资产、删除操作统一批量提交；
- 仓库目录树浏览、工作区状态标记、二进制图片预览。

## 高级配置

VisualMD 默认开箱即用，同时支持自主对接私有 Git 仓库、自定义 AI 模型服务，灵活拓展工作流。

### Git 仓库连接准备

如果你要连接仓库并使用提交、同步、冲突处理等能力，需要先准备一个 **PAT / Token**。当前支持的平台是：

- `GitHub`
- `Gitee`

在 Visual MD 的 Git 设置里，需要填写这些字段：

- `Provider`：选择 `GitHub` 或 `Gitee`
- `Token`：你的 PAT / 访问令牌
- `owner / group`：用户名、组织名或命名空间
- `repo`：仓库名
- `branch`：分支名，例如 `main`

#### GitHub 的操作方法

使用细粒度 token 而不是经典 token：**Fine-grained personal access token**：

1. 打开 [github-personal-access-tokens](https://github.com/settings/personal-access-tokens)
2. 进入 `Fine-grained tokens`
3. 创建新的 token
4. 选择你要访问的账号或组织，以及目标仓库
5. 给对应仓库Contents中的读写权限

如果你的组织对 token 有额外限制，可能还需要组织管理员放行。GitHub 官方也建议优先使用细粒度 token，而不是经典 token。

#### Gitee 的操作方法

Gitee 侧通常使用个人访问令牌：

1. 登录 Gitee
2. 打开个人设置中的令牌页面
3. 创建新的访问令牌
4. 给它分配能覆盖仓库访问与推送的权限

推荐从这个入口进入：[gitee-personal_access_tokens](https://gitee.com/profile/personal_access_tokens)

对 Visual MD 而言，建议至少确保：

- 能读取目标仓库内容
- 能向目标仓库写入或推送内容

#### Git 连接失败时优先检查

如果仓库连接失败，最常见的不是程序问题，而是配置问题：

1. `Provider` 是否选对了，`GitHub` 和 `Gitee` 不能混用
2. `Token` 是否填错、过期或权限不足
3. `owner / group`、`repo`、`branch` 是否拼写错误
4. 该 token 是否真的有权访问这个仓库

#### Git Token 安全注意事项

- 优先给最小必要权限，不要为了省事直接给全权限
- 尽量只授权需要的仓库，不要默认放开全部私有仓库
- 如果怀疑泄露，立即去 GitHub / Gitee 后台撤销旧 token 并重新生成
- 当前项目会把 token 保存在浏览器本地，并做本地加密/混淆处理；这能降低误暴露风险，但不等于服务端级密钥托管，因此仍应避免在不可信设备上长期保存高权限 token

### AI 配置准备

Visual MD 的 AI 能力采用“自带模型通道”的方式工作。要启用 AI，需要在 AI 设置面板中准备并填写：

- `API Base URL`
- `API Key`
- `Model`

当前项目支持：

- `OpenAI-compatible`
- `Anthropic-compatible`

并内置了多种预设通道，例如 OpenAI、Anthropic、OpenRouter、SiliconFlow、通义、火山方舟、智谱等。你也可以手动填写自定义兼容接口。

#### AI 的操作方法

1. 打开 AI 设置面板
2. 选择一个预设 provider，或新建自定义 provider
3. 填写 `API Base URL`
4. 填写 `API Key`
5. 选择或刷新 `Model`
6. 点击 `测试连接`

如果模型列表可以自动读取，也可以先填好 `API Base URL` 和 `API Key`，再刷新模型列表。

#### AI Key 安全注意事项

- 优先使用具有额度管控或免费的`API Key` 
- 如果怀疑泄露，第一时间去对应平台撤销旧 key 并重新生成
- 如果你非常在意密钥暴露风险，更稳妥的方案是通过你自己的后端或代理层转发，而不是把高敏感 key 直接输入前端页面
- 当前项目会把 AI Key 保存在浏览器本地，并做本地加密/混淆处理；它适合个人自带 key 的使用方式，但不应被理解为企业级密钥保险箱

---

## 本地开发与运行
### 环境要求
- Node.js >= 22
- pnpm >= 8

#### 一、安装 Node.js 与 pnpm
1. Node.js 官网下载 LTS 版本：https://nodejs.org/
校验安装：
```bash
node -v
```
2. 通过 corepack 启用 pnpm
```bash
corepack enable
corepack prepare pnpm@latest --activate
```
校验 pnpm：
```bash
pnpm -v
```

#### 二、拉取项目并运行
```bash
git clone <repository-url>
cd VisualMD
pnpm install
pnpm dev
```
本地访问：http://localhost:3000

#### 常用脚本命令
```bash
pnpm dev      # 本地开发热更新
pnpm build    # 生产打包静态资源
pnpm start    # 生产环境运行
pnpm lint     # 代码格式校验
pnpm test     # 单元测试
pnpm test:git # Git 模块专项测试
```

### 技术栈
| 分类 | 依赖技术 |
| --- | --- |
| 前端框架 | Next.js 16, React 19 |
| 类型系统 | TypeScript 5 |
| 状态管理 | Zustand |
| UI 组件 | Tailwind CSS 4, Radix UI |
| 树形画布 | React Flow / @xyflow/react |
| Markdown 编译 | unified, remark, rehype, js-yaml |
| 图表公式 | Mermaid, KaTeX |
| 动效 | Framer Motion |
| 测试框架 | Vitest |


## 贡献指南
欢迎提交 Issue 讨论需求、提交 Pull Request 共建项目。
优先欢迎以下类型贡献：
- 功能 Bug 修复、性能优化
- 编辑器交互、UI 体验优化
- AI Copilot 上下文、指令能力增强
- Git 同步、冲突处理逻辑完善
- Prototype 原型语法扩展
- 官方文档、示例模板补充

## 许可证

VisualMD 基于 Apache-2.0 License 开源。

允许个人和商业用途，包括修改、扩展和分发。
使用时请遵守 Apache-2.0 协议要求。

完整许可证：
[LICENSE.txt](LICENSE.txt)