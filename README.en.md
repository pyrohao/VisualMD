# Visual MD · Visual Markdown Editor

<p align="center">
  <img src="./public/apple-icon.png" alt="Visual MD" width="120">
</p>

<p align="center">
  <strong>THINK IN TREES!</strong>
</p>

<p align="center">
  <a href="#why-visual-md">Why Visual MD</a> ·
  <a href="#core-capabilities">Core Capabilities</a> ·
  <a href="#git-workflow">Git Workflow</a> ·
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

## Why Visual MD

**Visual MD** is not just Markdown with a nicer UI. It turns Markdown into a workspace where structure can be seen, moved, reviewed, and versioned more naturally.

It is designed around a few recurring pain points:

- **Long Markdown files are hard to read and refactor**
- **Structural edits are expensive in plain text**
- **Image pasting in Markdown is usually clumsy**
- **Many browser editors can edit Git files, but not with real staging semantics**

Visual MD approaches this differently:

- Use trees and canvases to understand document structure.
- Keep Markdown as the source of truth so content stays portable and reviewable.
- Treat Git-backed document editing closer to a real SCM workflow.

### Preview

<p align="center">
  <img src="./public/assets/screenshots/read-theme.png" alt="Reading Theme" width="96%">
</p>
<p align="center">
  <img src="./public/assets/screenshots/light-theme.png" alt="Light Theme" width="48%">
  <img src="./public/assets/screenshots/dark-theme.png" alt="Dark Theme" width="48%">
</p>

---

## Core Capabilities

### 1. Visual tree editing

- Built on **React Flow** to turn heading hierarchy into an interactive structure tree
- Drag nodes to reorganize content
- Batch-create child nodes, reorder sections, and clean up layout quickly
- One-click layout organization for large documents
- Added top-left canvas controls: view switcher (Mindmap / Prototype) and layout switcher (Balanced / Left / Right / Down)
- Improved spacing calculation for the Down layout (org-chart style) to reduce sibling-node crowding

### 2. Bidirectional editing

- **Visual mode** for structural editing
- **Text mode** for direct Markdown editing
- **Read / Edit preview switching** inside one panel
- Changes stay synchronized across representations
- Live mode now supports synchronized scrolling between the editor pane and preview pane for long-document side-by-side review

### 3. HTML prototype rendering

- Switch the canvas into **Prototype** mode to derive a page-like prototype from Markdown structure and content.
- Headings, paragraphs, tables, checklists, and code blocks can be rendered into a more interface-oriented HTML prototype layout.
- `@proto` commands can declare inputs, buttons, toggles, tabs, cards, stats, and similar interactive elements.
- This makes it practical to move between documentation, requirements, and low-fidelity interface sketching without maintaining separate artifacts.

### 4. Detached node management

- Temporarily pull nodes out of the tree and manage them separately
- Reattach them later to any valid parent
- Built-in level validation helps prevent broken structure

### 5. Markdown plus metadata

- Parse and generate YAML front matter
- Keep headings, body blocks, and metadata in sync
- Works well for technical docs, knowledge notes, prompt assets, and structured writing

### 6. Templates and AI generation

- Built-in templates for fast document bootstrapping
- Import custom `.md` templates
- Generate structured Markdown with multiple AI providers
- Encrypted local API key storage and connection testing

### 7. Themes and multilingual UI

- Reading, light, and dark themes
- Chinese / English UI switching
- Preview styling follows theme changes for a consistent reading experience

---

## Git Workflow

This is one of the biggest upgrades in the current version.

Visual MD is no longer just “able to open Markdown files from Git”. It now starts to behave much closer to a real SCM-oriented document workflow.

### Supported today

- Connect to **GitHub / Gitee**
- Browse repository trees and open Markdown files
- Fetch remote updates, detect conflicts, preserve local drafts
- Stage content changes
- Stage file deletions and folder deletions
- Unstage and restore deleted content
- **Single batch commit**: text edits, images, and deletions are submitted together instead of producing multiple fragmented commits

### Image paste workflow

This is one of the strongest user-facing improvements:

1. Open a Git-tracked Markdown document in edit mode.
2. Paste an image directly.
3. Visual MD generates a separate asset path and inserts a normal Markdown image reference.
4. Switch to preview and the image is immediately visible.
5. Before commit, the image exists only in the local staged state, not in remote history.
6. On commit, text and asset changes are submitted together in one atomic operation.

### What this solves

- **No more base64 blobs inside Markdown body content**
- **No more accidental remote commits just because an image was pasted**
- **Deleted files are staged first instead of disappearing remotely immediately**
- **A single commit now represents a complete document change**

### Preview safety

- Markdown preview is now sanitized with an allowlist policy
- Dangerous raw HTML is no longer passed through by default
- Common Markdown rendering still works while the XSS surface is significantly reduced

---

## Good Fit For

Visual MD works especially well for:

- Technical documentation
- Knowledge bases and study notes
- Prompt / skill / workflow documents
- Low-fidelity page prototypes and interaction sketches
- Long-form writing that needs frequent restructuring
- Teams maintaining Markdown assets directly in Git repositories

---

## Quick Start

### Requirements

- **Node.js** >= 22
- **pnpm** >= 8

### Install and run

```bash
git clone <repository-url>
cd VisualMD
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

### Production build

```bash
pnpm build
pnpm start
```

### Common commands

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```

---

## Technical Architecture

### Tech stack

| Category | Technology |
|------|------|
| Framework | Next.js 16, React 19 |
| Language | TypeScript 5 |
| State management | Zustand |
| UI | Tailwind CSS 4, Radix UI |
| Visual editing | React Flow / @xyflow/react |
| Markdown pipeline | unified, remark, rehype, js-yaml |
| Animation | Framer Motion |

### Key modules

- `lib/markdown-parser.ts`
  - Parses Markdown, heading hierarchy, and YAML metadata
- `lib/markdown-generator.ts`
  - Rebuilds Markdown from the internal document tree
- `stores/documentStore.ts`
  - Coordinates document tree state, selection, detached nodes, and history
- `stores/gitStore.ts`
  - Handles Git repositories, drafts, staging, and batch commits
- `components/markdown-preview.tsx`
  - Renders Markdown, handles read/edit switching, resolves Git images, and sanitizes preview HTML

---

## Current Highlights

- **Think in trees instead of scrolling raw Markdown**
- **Visual editing stays aligned with Markdown source**
- **Markdown can directly drive interactive HTML prototypes**
- **Git-backed document editing now has actual staging semantics**
- **Image paste no longer bloats Markdown or pollutes remote history early**
- **Preview now has a meaningful baseline XSS defense**

---

## Recent Updates (2026-06)

- Canvas interaction refresh: top-left unified view/layout controls, dedicated top-right Metadata entry, improved hover hints, and better theme adaptation.
- Down-layout spacing optimization: fixed sibling nodes being too crowded in organization-style layouts.
- Node-handle and edge rendering fixes: removed duplicated side handles, fixed missing bezier segments in two-sided down layout, and unified handle visibility rules across layout modes.
- Live preview enhancement: synchronized scrolling between edit and preview panes.
- Unsaved-state fix: switching files no longer triggers a false unsaved prompt on first switch when no actual edits were made.

---

## Development Notes

The project uses ESLint for code quality checks:

```bash
pnpm lint
```

For larger changes, it is recommended to verify at least:

```bash
pnpm lint
node_modules/.bin/tsc -p tsconfig.json --noEmit
```

---

## Roadmap

Still worth building next:

### Mid-term

- A stronger source editor core (Monaco / CodeMirror)
- More export formats (PDF / Word)
- Richer Git interactions and diff visibility

### Long-term

- VS Code extension
- Mobile / tablet adaptation
- Plugin system
- Multiplayer collaboration
- Obsidian plugin

---

## Contributing

Issues and pull requests are welcome.

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Open a pull request

Helpful contribution categories:

- Bug fixes
- New features
- Documentation improvements
- UI / UX refinements
- Performance work

---

## License

This project is open source under the [Apache-2.0 License](LICENSE.txt).

---

## Acknowledgments

- [React Flow](https://reactflow.dev/) - visual canvas foundation
- [shadcn/ui](https://ui.shadcn.com/) - UI component system
- [Zustand](https://github.com/pmndrs/zustand) - state management
- [Remark](https://github.com/remarkjs/remark) - Markdown processing ecosystem

---

<p align="center">
  Built with ❤️ · Make Markdown editing more visual, structured, and Git-friendly
</p>
