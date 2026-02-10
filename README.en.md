# Visual MD — Visual Markdown Editor

<p align="center">
  <img src="./public/apple-icon.png" alt="Visual MD" width="120">
</p>

<p align="center">
  <strong>THINK IN TREES!</strong>
</p>

<p align="center">
  <a href="#core-features">Core Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#technical-architecture">Technical Architecture</a>
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
  <a href="./README.md">中文</a> | <strong>English</strong>
</p>

---

## Introduction

**Visual MD** is an innovative visual Markdown editor that combines traditional text editing with modern node-based editing. It displays document hierarchy through an intuitive tree structure, helping you **see the document skeleton at a glance**, **quickly understand content flow, and efficiently organize document structure**.

Whether reading long documents, organizing knowledge notes, planning article structures, or designing prompts, Visual MD helps you:
- 📊 **Quick Overview** - Visual tree structure makes document structure clear at a glance
- 🔍 **Precise Navigation** - Click nodes to jump to corresponding content
- ✏️ **Efficient Editing** - Drag to adjust structure, sync updates in real-time

### Preview

<p align="center">
  <img src="./public/assets/screenshots/read-theme.png" alt="Reading Theme" width="96%">
</p>
<p align="center">
  <img src="./public/assets/screenshots/light-theme.png" alt="Light Theme" width="48%">
  <img src="./public/assets/screenshots/dark-theme.png" alt="Dark Theme" width="48%">
</p>

- 🎯 **Visual Editing** - Say goodbye to pure text editing, organize document structure intuitively through drag-and-drop nodes
- 🔄 **Bidirectional Sync** - Visual editing and Markdown source code sync in real-time
- ⚡ **High Performance** - Smooth canvas interaction experience based on React Flow
- 🎨 **Theme Customization** - Support multiple color themes to meet different aesthetic needs

---

## Core Features

### 1. Visual Node Tree

- Use **React Flow** to display document structure
- Support dragging nodes to reorganize content
- Horizontal tree layout, clearly showing document hierarchy
- One-click organize feature, automatically optimize node layout

### 2. Bidirectional Editing Mode

The editor supports seamless switching between two editing modes:

- **Visual Mode** - Edit document structure intuitively through node graphs
- **Text Mode** - Edit Markdown source code directly

Changes in both modes sync in real-time, ensuring data consistency.

### 3. Detached Node Management

Innovative node detachment and reconnection features:

- **Detach Node** - Separate nodes from the tree structure, keeping them in the detached nodes panel
- **Reconnect** - Reconnect detached nodes to any parent node at any time
- **Level Validation** - Automatically validate parent-child node level relationships
- **Independent Management** - Detached nodes panel centrally manages all floating nodes

### 4. Smart Node Operations

Rich node operation features:

- **Batch Creation** - Create multiple child nodes at once
- **Flexible Deletion** - Delete only current node (child nodes become detached) or delete entire branch
- **Node Sorting** - Drag to adjust node order
- **Edge Operations** - Right-click edges to delete connections, select edges to highlight

### 5. Template System

Provide rich document templates for quick start:

**Built-in Templates**:
- **Capability Skill** - Capability skill document template
- **Constraint Skill** - Constraint skill document template
- **Decision Skill** - Decision skill document template
- **Procedural Skill** - Procedural skill document template
- **Prompt Template** - Prompt template

**Template Features**:
- One-click apply template to create new documents
- Support importing custom templates (.md files)
- Real-time preview and editing of template content

### 6. AI Document Generation

Support multiple AI providers, intelligently generate structured documents:

**Built-in Supported Providers**:
- **OpenAI** - GPT series models
- **Volcano Engine** - Doubao, DeepSeek series
- **Silicon Flow** - DeepSeek, Qwen series
- **Zhipu AI** - GLM series
- **Tongyi Qianwen** - Qwen series
- **OpenRouter** - Multi-vendor model aggregation
- **Custom** - Support any OpenAI compatible API

**Feature Highlights**:
- Intelligent content generation, automatically generate structured Markdown documents
- Independent configuration for each provider (API address, model, temperature parameters, etc.)
- Configuration testing feature to verify connection availability
- API key encrypted storage

### 7. Multi-language Support

- **Interface Language** - Support Chinese and English interface switching
- **AI Language Detection** - AI automatically selects output language based on user input language
- **Unicode Support** - Full support for international characters

### 8. File System Management

- Support multi-file tabs
- Folder tree browsing
- File creation, renaming, deletion
- Auto-save and modification markers
- Export to Markdown or HTML format

### 9. History and Undo/Redo

Complete editing history management:

- **Undo/Redo** - Support multi-step undo and redo operations
- **History Limit** - Maximum 50 records to prevent memory overflow
- **Batch Operation Merge** - Continuous operations automatically merge into single record
- **Operation Description** - Clearly display undoable operation types

---

## Quick Start

### Requirements

- **Node.js** >= 22
- **pnpm** >= 8 (recommended)

### Installation

```bash
# Clone the project
git clone <repository-url>
cd markdown-editor-design

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Open browser and visit [http://localhost:3000](http://localhost:3000) to use.

### Build Production Version

```bash
# Build
pnpm build

# Start production server
pnpm start
```

---

## Technical Architecture

### Tech Stack

| Category | Technology |
|------|------|
| **Framework** | Next.js 16.0, React 19.2 |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 4.1, Radix UI |
| **State Management** | Zustand 5.0 |
| **Visualization** | React Flow 12.3 (@xyflow/react) |
| **Markdown** | unified, remark, rehype, js-yaml |
| **Animation** | Framer Motion 12.29 |
| **Tools** | nanoid, lucide-react, date-fns |

### Core Modules

#### 1. Markdown Parser (`lib/markdown-parser.ts`)

Four-step parsing algorithm:

1. **Extract Metadata (YAML Front Matter)** - Use regex `/^---\s*\n([\s\S]*?)\n---/` to match, use `js-yaml` to parse YAML metadata
2. **Extract Heading Nodes** - Use regex `/^(#{1,6})\s+(.+)$/gm` to match all headings
3. **Build Tree Structure** - Optimized algorithm:
   - Determine maximum heading level, create virtual root node
   - Handle orphan nodes (headings without parent nodes)
   - Use stack structure, O(n) time complexity to build tree
4. **Extract Content Blocks** - Extract own content for each node (excluding child node content)

#### 2. Markdown Generator (`lib/markdown-generator.ts`)

Depth-first traversal algorithm:

1. **Generate Metadata (YAML Front Matter)** - Custom YAML serialization (handling multi-line values, special characters, etc.)
2. **DFS Generate Content** - Recursively traverse tree structure:
   - Skip detached nodes (`isDetached=true`)
   - Render child nodes in `children` array order
   - Generate headings and content blocks

#### 3. Markdown Preview Rendering (`components/markdown-preview.tsx`)

Use **Remark** ecosystem for professional Markdown rendering:

- **unified** - Unified processor interface, coordinating the entire rendering process
- **remark-parse** - Parse Markdown text into syntax tree
- **remark-gfm** - Support GitHub Flavored Markdown (tables, strikethrough, task lists, etc.)
- **remark-rehype** - Convert Markdown syntax tree to HTML syntax tree
- **rehype-stringify** - Serialize HTML syntax tree to HTML string
- **Theme Adaptation** - Dynamically generate CSS styles based on current theme

#### 4. Layout Engine (`lib/layout-engine.ts`)

Horizontal mind map layout algorithm:

- **Root node on the left**, child nodes expand to the right
- **Dynamic node position calculation** - Based on level depth and subtree height
- **Parent node centered** - Located at the vertical center of all child nodes
- **Detached node handling** - Preserve original position or place in independent area on the right
- Time complexity: O(n)

---

## Development Guide

### Development Environment Setup

```bash
# Install dependencies
pnpm install

# Start development server (with hot reload)
pnpm dev
```

### Code Standards

The project uses ESLint for code checking:

```bash
# Run code check
pnpm lint
```

---

## Contributing Guide

We welcome all forms of contribution!

### How to Contribute

1. **Fork** this repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Create a **Pull Request**

### Contribution Types

- 🐛 **Bug Fix** - Fix issues in the code
- ✨ **New Feature** - Add new features or improvements
- 📚 **Documentation** - Improve documentation or add examples
- 🎨 **UI/UX** - Improve user interface and experience
- ⚡ **Performance** - Optimize performance

---

## License

This project is open source under the [Apache-2.0 License](LICENSE.txt).

---

## Roadmap

Here are the planned features. Thanks for all the suggestions:

### 🟢 Easy (Planned)

| Feature | Description |
|---------|-------------|
| **Collapsible Layout** | Visual canvas can be collapsed for focused editing |
| **Shortcut Optimization** | Add more keyboard shortcuts |
| **Theme Tuning** | Optimize existing theme colors |

### 🟡 Medium

| Feature | Description |
|---------|-------------|
| **Editor Enhancement** | Replace textarea with Monaco/CodeMirror, support syntax highlighting and completion |
| **GitHub Sync** | Pure frontend implementation, OAuth + GitHub API for document sync |
| **Export Optimization** | Support more export formats (PDF, Word) |

### 🟠 Hard

| Feature | Description |
|---------|-------------|
| **VS Code Extension** | Integrate visual editing into VS Code |
| **Mobile Adaptation** | Responsive layout, support tablet devices |
| **Plugin System** | Support custom plugin extensions |

### 🔴 Very Hard

| Feature | Description |
|---------|-------------|
| **Multiplayer Collaboration** | Real-time collaborative editing based on Yjs |
| **Obsidian Plugin** | As an Obsidian community plugin |

---

## Acknowledgments

Thanks to the following open source projects:

- [React Flow](https://reactflow.dev/) - Visual canvas engine
- [shadcn/ui](https://ui.shadcn.com/) - UI component library
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [Remark](https://github.com/remarkjs/remark) - Markdown processing

---

<p align="center">
  Built with ❤️ | Make Markdown editing more intuitive and efficient
</p>
