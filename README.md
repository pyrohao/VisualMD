# Visual MD · 可视化 Markdown 编辑器

<p align="center">
  <img src="./public/apple-icon.png" alt="Visual MD" width="120">
</p>

<p align="center">
  <strong>THINK IN TREES!</strong>
</p>

<p align="center">
  <a href="#为什么是-visual-md">为什么是 Visual MD</a> ·
  <a href="#核心能力">核心能力</a> ·
  <a href="#git-工作流">Git 工作流</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#技术架构">技术架构</a>
</p>

<p align="center">
  <a href="#">
    <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16.0-black?logo=next.js"></a>
  <a href="#">
    <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react"></a>
  <a href="#">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript"></a>
  <a href="#">
    <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-4.0-06B6D4?logo=tailwindcss"></a>
  <a href="#">
    <img alt="Zustand" src="https://img.shields.io/badge/Zustand-5.0-FF6B6B"></a>
</p>

<p align="center">
  <strong>中文</strong> | <a href="./README.en.md">English</a>
</p>

---

## 为什么是 Visual MD

**Visual MD** 不是把 Markdown 包一层“好看皮肤”，而是把 Markdown 文档真正变成一个可组织、可移动、可检查结构的工作空间。

它主要解决这几类高频痛点：

- **长文档难读难改**：章节深、层级多，靠源码滚动定位效率低。
- **结构调整成本高**：改大纲、挪章节、拆内容，纯文本编辑容易出错。
- **图片粘贴体验差**：传统 Markdown 要么手动管理图片文件，要么把 base64 塞进正文导致文件膨胀。
- **Git 协作心智不统一**：很多在线编辑器能改文件，但不能像真正的 SCM 一样暂存、恢复、统一提交。

Visual MD 的核心思路是：

- 用树和画布理解文档结构。
- 用 Markdown 保持内容可迁移、可审阅、可版本化。
- 用接近 SCM 的方式处理 Git 文档编辑、图片资产和删除恢复。

### 预览

<p align="center">
  <img src="./public/assets/screenshots/read-theme.png" alt="阅读主题" width="96%">
</p>
<p align="center">
  <img src="./public/assets/screenshots/light-theme.png" alt="明亮主题" width="48%">
  <img src="./public/assets/screenshots/dark-theme.png" alt="暗色主题" width="48%">
</p>

---

## 核心能力

### 1. 可视化树形编辑

- 基于 **React Flow** 的节点画布，把 Markdown 标题层级直接展开成结构树。
- 支持拖拽调整结构、批量创建子节点、节点重排和分支删除。
- 提供自动整理布局，快速把混乱的结构重新排整齐。
- 新增左上角画布控制：视图切换（脑图 / 原型）与布局切换（平衡 / 左侧 / 右侧 / 向下）。
- 向下布局（组织图）已优化节点间距估算，减少同层节点拥挤。

### 2. 双向同步编辑

- **可视化模式**：适合调整结构、梳理大纲、快速重组内容。
- **文本模式**：适合直接修改 Markdown 源码。
- **阅读 / 编辑预览切换**：在一个面板中完成源码编辑和结果核对。
- 各模式间实时同步，避免“一个地方改了，另一个地方没更新”。
- Live 模式支持编辑区与预览区滚动同步，长文对照更顺畅。

### 3. HTML 原型渲染

- 支持在画布中切换到 **Prototype 原型视图**，从 Markdown 大纲和内容推导页面原型。
- 可把标题层级、正文块、表格、清单、代码块等内容渲染成更接近界面的 HTML 原型结构。
- 支持通过 `@proto` 指令声明输入框、按钮、开关、Tabs、卡片、统计块等交互元素。
- 适合在写文档、写需求和搭页面草图之间来回切换，减少“文档一份、原型一份”的重复劳动。

### 4. 断开节点管理

- 可以把一个节点从树中临时拆出，放到独立区域继续整理。
- 支持后续重新挂回任意合法父节点。
- 对层级关系做约束校验，减少结构损坏。

### 5. Markdown 与元数据并重

- 支持 YAML Front Matter 解析与生成。
- 支持标题树、正文块、元数据的双向转换。
- 适合知识文档、技术文档、提示词文档、模板类内容。

### 6. 模板与 AI 生成

- 内置多种文档模板，可一键创建。
- 支持导入自定义 `.md` 模板。
- 支持多提供商 AI 生成结构化 Markdown 文档。
- API Key 本地加密存储，提供配置测试能力。

### 7. 主题与多语言

- 内置阅读、明亮、暗色等主题。
- 中英文界面切换。
- 预览样式会跟随主题变化，保持阅读一致性。

---

## Git 工作流

这是当前版本最重要的一次增强方向之一。

Visual MD 已不只是“能打开 Git 仓库里的 Markdown”，而是开始具备接近真正 SCM 的文档编辑体验。

### 当前已支持

- 连接 **GitHub / Gitee**
- 浏览仓库树并打开 Markdown 文件
- 获取远端更新、检测冲突、保留本地草稿
- 暂存内容修改
- 暂存文件删除 / 文件夹删除
- 取消暂存并恢复删除内容
- **单次批量提交**：一次提交中的文本、图片、删除操作会统一提交，而不是逐条生成多个 commit

### 图片粘贴工作流

这是这次修订里最值得强调的体验点：

1. 用户在 Git 跟踪的 Markdown 文档中进入编辑模式。
2. 直接粘贴图片。
3. 编辑器会为图片生成独立资源路径，并在正文里写入普通 Markdown 图片引用。
4. 预览模式可立即看到图片。
5. 在真正提交前，图片只存在于本地暂存中，不会污染远端仓库历史。
6. 提交时，文本修改和图片资源会一起进入一次原子提交。

### 这套设计解决了什么

- **不再把 base64 图片塞进 Markdown 正文**
- **不再因为一次粘贴图片就提前污染仓库 commit 历史**
- **删除文件不再立即远端消失，而是先进入暂存，可恢复**
- **一次提交就是一次完整变更，而不是拆成多个零散 commit**

### 预览安全性

- Markdown 预览已加入 HTML 白名单清洗。
- 默认不再放行危险的原始 HTML 注入。
- 在保留常规 Markdown 渲染能力的同时，降低 XSS 风险。

---

## 适用场景

Visual MD 适合这些内容工作：

- 技术文档与设计文档
- 知识库与学习笔记
- Prompt / Skill / Workflow 文档
- 低保真页面原型与交互草图
- 需要频繁调整结构的长文
- 希望直接基于 Git 仓库维护 Markdown 资产的团队

---

## 快速开始

### 环境要求

- **Node.js** >= 22
- **pnpm** >= 8

### 安装与运行

```bash
git clone <repository-url>
cd VisualMD
pnpm install
pnpm dev
```

打开浏览器访问 [http://localhost:3000](http://localhost:3000)

### 生产构建

```bash
pnpm build
pnpm start
```

### 常用命令

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```

---

## 技术架构

### 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16、React 19 |
| 语言 | TypeScript 5 |
| 状态管理 | Zustand |
| UI | Tailwind CSS 4、Radix UI |
| 可视化编辑 | React Flow / @xyflow/react |
| Markdown 处理 | unified、remark、rehype、js-yaml |
| 动画 | Framer Motion |

### 核心模块

- `lib/markdown-parser.ts`
  - 解析 Markdown、标题层级与 YAML 元数据
- `lib/markdown-generator.ts`
  - 从文档树重新生成 Markdown
- `stores/documentStore.ts`
  - 文档树、选中状态、断开节点、历史记录协调
- `stores/gitStore.ts`
  - Git 仓库连接、草稿、暂存区、批量提交
- `components/markdown-preview.tsx`
  - Markdown 渲染、预览/编辑切换、Git 图片解析、安全清洗

---

## 当前亮点

- **树状思考而不是滚源码**
- **可视化编辑与 Markdown 保持统一**
- **Markdown 可以直接派生交互式 HTML 原型**
- **Git 文档编辑终于有了“暂存”语义**
- **图片粘贴不再污染正文，也不提前污染仓库历史**
- **预览已经补上基础安全防线**

---

## 近期更新（2026-06）

- 画布交互重构：左上角统一放置视图与布局切换，右上角独立 Metadata 入口，悬浮提示与主题适配同步优化。
- 向下布局间距计算优化：修复同层节点容易挤在一起的问题，结构图可读性更高。
- 节点连接点与连线修复：修复重复渲染连接点、双侧向下布局贝塞尔曲线缺失等问题，并统一不同布局下的连接点显示规则。
- 右侧预览 Live 模式增强：编辑区与预览区滚动同步。
- 未保存状态修复：首次切换文件不再误触发“未保存更改”提示，未编辑时切换默认无干扰。

---

## 开发说明

项目使用 ESLint 做代码检查：

```bash
pnpm lint
```

如果你正在进行较大改动，建议至少验证：

```bash
pnpm lint
node_modules/.bin/tsc -p tsconfig.json --noEmit
```

---

## 路线图

后续仍然值得推进的方向：

### 中期

- 更强的文本编辑器内核（Monaco / CodeMirror）
- 更多导出格式（PDF / Word）
- 更完整的 Git 交互体验与差异查看

### 长期

- VS Code 插件化
- 移动端 / 平板适配
- 插件系统
- 多人协作
- Obsidian 插件

---

## 贡献

欢迎提交 Issue 和 PR。

1. Fork 本仓库
2. 创建功能分支
3. 提交修改
4. 发起 Pull Request

欢迎的贡献类型包括：

- Bug 修复
- 新功能
- 文档完善
- UI / UX 改进
- 性能优化

---

## 许可证

本项目基于 [Apache-2.0 许可证](LICENSE.txt) 开源。

---

## 致谢

- [React Flow](https://reactflow.dev/) - 可视化画布能力
- [shadcn/ui](https://ui.shadcn.com/) - UI 组件体系
- [Zustand](https://github.com/pmndrs/zustand) - 状态管理
- [Remark](https://github.com/remarkjs/remark) - Markdown 处理生态

---

<p align="center">
  用 ❤️ 构建 · 让 Markdown 编辑更直观、更适合结构化思考
</p>
