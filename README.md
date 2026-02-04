# Visual MD — 可视化Markdown编辑器

<p align="center">
  <strong>Markdown 文档智能转可视化树状结构，直观呈现文档骨架，快速梳理内容脉络，让编辑、阅读、梳理更省心</strong>
</p>

<p align="center">
  <a href="#核心功能">核心功能</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#技术架构">技术架构</a> ·
  <a href="#使用指南">使用指南</a>
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

---

## 简介

**Visual MD** 是一款创新的 Markdown 可视化编辑器，它将传统的文本编辑与现代化的节点编辑相结合。通过直观的树状结构展示文档层级，让你**一眼看清文档骨架**，**快速理解内容脉络**。

无论是阅读长篇文档、整理知识笔记，还是规划文章结构，Visual MD 都能帮助你：
- 📊 **快速概览** - 可视化树状结构让文档结构一目了然
- 🔍 **精准定位** - 点击节点即可跳转到对应内容
- ✏️ **高效编辑** - 拖拽调整结构，实时同步更新

### 为什么选择我们？

- 🎯 **可视化编辑** - 告别纯文本编辑，通过拖拽节点直观组织文档结构
- 🔄 **双向同步** - 可视化编辑与 Markdown 源码实时同步
- ⚡ **高性能** - 基于 React Flow 的流畅画布交互体验
- 🎨 **主题定制** - 支持多种配色主题，满足不同审美需求

---

## 核心功能

### 1. 可视化节点树

- 使用 **React Flow** 展示文档结构
- 支持拖拽节点重新组织内容
- 横向树状布局，清晰展示文档层级
- 一键整理功能，自动优化节点布局

### 2. 双向编辑模式

编辑器支持两种编辑模式无缝切换：

- **可视化模式** - 通过节点图直观编辑文档结构
- **文本模式** - 直接编辑 Markdown 源码

两种模式的修改会实时同步，确保数据一致性。

### 3. 智能解析引擎

采用统一的解析引擎进行 Markdown 处理：

- **Metadata (YAML Front Matter) 解析** - 支持文档元数据管理
- **标题树解析** - 基于栈的算法高效构建文档树
- **内容块提取** - 精确提取节点内容

### 4. 强大的状态管理

基于 **Zustand** 的全局状态管理：

- 文档加载与保存
- 节点更新、移动、删除
- 历史记录与撤销/重做
- 实时同步所有视图

### 5. 文件系统管理

- 支持多文件标签页
- 文件夹树状浏览
- 文件创建、重命名、删除
- 自动保存与修改标记

### 6. 模板系统

提供丰富的文档模板，快速开始写作：

**内置模板**：
- **Capability Skill** - 能力技能文档模板
- **Constraint Skill** - 约束技能文档模板
- **Decision Skill** - 决策技能文档模板
- **Procedural Skill** - 程序技能文档模板
- **Prompt Template** - 提示词模板

**模板功能**：
- 一键应用模板创建新文档
- 支持导入自定义模板（.md 文件）
- 模板内容实时预览和编辑
- 模板分类管理和筛选

### 7. AI 辅助功能

支持多种 AI 提供商，满足不同场景需求：

**内置支持的提供商**：
- **OpenAI** - GPT 系列模型
- **火山引擎** - Doubao、DeepSeek 系列
- **硅基流动** - DeepSeek、Qwen 系列
- **智谱 AI** - GLM 系列
- **通义千问** - Qwen 系列
- **OpenRouter** - 多厂商模型聚合
- **自定义** - 支持任意 OpenAI 兼容 API

**功能特性**：
- 智能内容生成，自动生成结构化 Markdown 文档
- 每个提供商独立配置（API 地址、模型、温度参数等）
- 配置测试功能，验证连接可用性
- API 密钥加密存储

---

## 快速开始

### 环境要求

- **Node.js** >= 22
- **pnpm** >= 8 (推荐)

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd markdown-editor-design

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

打开浏览器访问 [http://localhost:3000](http://localhost:3000) 即可使用。

### 构建生产版本

```bash
# 构建
pnpm build

# 启动生产服务器
pnpm start
```

---

## 技术架构

### 技术栈

| 类别 | 技术 |
|------|------|
| **框架** | Next.js 16.0, React 19.2 |
| **语言** | TypeScript 5 |
| **样式** | Tailwind CSS 4.1, Radix UI |
| **状态管理** | Zustand 5.0 |
| **可视化** | React Flow 12.3 (@xyflow/react) |
| **Markdown** | unified, remark, rehype, js-yaml |
| **动画** | Framer Motion 12.29 |
| **工具库** | nanoid, lucide-react, date-fns |

### 核心模块

#### 1. Markdown 解析器 (`lib/markdown-parser.ts`)

三步解析算法：

1. **提取 Metadata (YAML Front Matter)** - 使用正则表达式匹配并解析 YAML 元数据
2. **提取标题节点** - 使用正则 `^(#{1,6})\s+(.+)$` 匹配所有标题
3. **构建树结构** - 优化算法：
   - 确定最大标题层级，创建虚拟根节点
   - 处理孤立节点（无父节点的标题）
   - 使用 O(n) 时间复杂度构建树

#### 2. Markdown 生成器 (`lib/markdown-generator.ts`)

深度优先遍历算法：

1. **生成 Metadata (YAML Front Matter)** - 使用 `js-yaml.dump()` 将元数据转为 YAML 格式
2. **DFS 生成内容** - 递归遍历树结构：
   - 跳过断开节点（`isDetached=true`）
   - 按 `children` 数组顺序渲染子节点
   - 生成标题和内容块

#### 3. Markdown 预览渲染 (`components/markdown-preview.tsx`)

使用 **Remark** 生态系统进行专业 Markdown 渲染：

- **unified** - 统一的处理器接口，协调整个渲染流程
- **remark-parse** - 将 Markdown 文本解析为语法树
- **remark-gfm** - 支持 GitHub Flavored Markdown（表格、删除线、任务列表等）
- **remark-rehype** - 将 Markdown 语法树转换为 HTML 语法树
- **rehype-stringify** - 将 HTML 语法树序列化为 HTML 字符串
- **主题适配** - 根据当前主题（明亮/黑暗/阅读模式）动态生成 CSS 样式

#### 4. 布局引擎 (`lib/layout-engine.ts`)

横向思维导图布局算法：

- **根节点在左侧**，子节点向右展开
- **动态计算节点位置** - 基于层级深度和子树高度
- **父节点居中** - 位于所有子节点的垂直中心
- **断开节点处理** - 保留原位置或放在右侧独立区域
- 时间复杂度：O(n)

---

## 使用指南

### 基本操作

#### 创建文档

1. 点击工具栏的 **新建** 按钮
2. 或使用快捷键 `Ctrl+N`

#### 编辑节点

- **单击节点** - 选中并编辑内容
- **双击节点** - 快速编辑标题
- **拖拽节点** - 调整节点位置或重新组织层级

#### 组织文档结构

- **添加子节点** - 右键点击节点选择"添加子节点"
- **删除节点** - 选中节点按 `Delete` 键
- **移动节点** - 拖拽节点到其他节点下方

#### 切换编辑模式

- 点击工具栏的 **文本/可视化** 切换按钮
- 在文本模式下直接编辑 Markdown 源码

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存文档 |
| `Ctrl+Z` | 撤销 |
| `Ctrl+Y` | 重做 |
| `Ctrl+N` | 新建文档 |
| `Ctrl+F` | 搜索 |
| `Delete` | 删除选中节点 |
| `Ctrl+B` | 加粗文本 |
| `Ctrl+I` | 斜体文本 |

### 主题切换

点击工具栏的主题切换按钮，可在以下三种专业配色模式间切换：

- ☀️ **明亮模式** - 类似 VS Code 默认浅色主题，清晰明亮
- 🌑 **黑暗模式** - 类似 GitHub Dark / VS Code Dark+，适合夜间使用
- 📖 **阅读模式** - 类似 Kindle/Apple Books 护眼模式，温暖舒适

---

## 高级功能

### Metadata 支持

文档元数据使用 Metadata (YAML Front Matter) 格式定义：

```yaml
---
name: 文档名称
description: 文档描述
author: 作者名称
version: 1.0.0
---
```

### 断开节点功能

支持将节点从树结构中"断开"，使其成为悬浮状态：

- 断开的节点不会渲染到 Markdown 中
- 可随时重新连接到树结构
- 适用于临时隐藏或重组内容

### 历史记录

完善的撤销/重做系统，保护您的编辑工作：

- **撤销栈管理** - 自动保存操作历史，支持多步撤销/重做
- **历史记录限制** - 最大历史记录数（默认50条），防止内存溢出
- **批量操作合并** - 连续操作自动合并为单条历史记录
- **操作描述显示** - 清晰展示当前可撤销的操作类型（如"更新节点"、"删除节点"等）
- **状态快照** - 完整保存文档树和元数据状态

---

## 开发指南

### 开发环境设置

```bash
# 安装依赖
pnpm install

# 启动开发服务器（带热重载）
pnpm dev
```

### 代码规范

项目使用 ESLint 进行代码检查：

```bash
# 运行代码检查
pnpm lint
```

---

## 贡献指南

我们欢迎所有形式的贡献！

### 如何贡献

1. **Fork** 本仓库
2. 创建你的功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 **Pull Request**

### 贡献类型

- 🐛 **Bug 修复** - 修复代码中的问题
- ✨ **新功能** - 添加新功能或改进
- 📚 **文档** - 改进文档或添加示例
- 🎨 **UI/UX** - 改进用户界面和体验
- ⚡ **性能** - 优化性能

---

## 许可证

本项目基于 [Apache-2.0 许可证](LICENSE.txt) 开源。

---

## 致谢

感谢以下开源项目的支持：

- [React Flow](https://reactflow.dev/) - 可视化画布引擎
- [shadcn/ui](https://ui.shadcn.com/) - UI 组件库
- [Zustand](https://github.com/pmndrs/zustand) - 状态管理
- [Remark](https://github.com/remarkjs/remark) - Markdown 处理

---

<p align="center">
  用 ❤️ 构建 | 让 Markdown 编辑更直观、更高效
</p>
