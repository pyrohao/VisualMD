# 侧边栏折叠按钮重构记录

## 修改时间
2026-01-31

## 修改内容

### 1. 可视化背景调整 (flow-canvas.tsx)
将背景调整为类似 draw.io 的粗细交错网格风格：
- 使用 CSS `linear-gradient` 实现自定义网格背景
- 粗网格线：100px 间距，透明度 25% (`${themeConfig.border}40`)
- 细网格线：20px 间距，透明度 12% (`${themeConfig.border}20`)
- 形成 draw.io 风格的粗细交错网格效果

```tsx
{/* 自定义网格背景 - draw.io 风格 */}
<div
  className="absolute inset-0 pointer-events-none"
  style={{
    backgroundImage: `
      linear-gradient(to right, ${themeConfig.border}40 1px, transparent 1px),
      linear-gradient(to bottom, ${themeConfig.border}40 1px, transparent 1px),
      linear-gradient(to right, ${themeConfig.border}20 1px, transparent 1px),
      linear-gradient(to bottom, ${themeConfig.border}20 1px, transparent 1px)
    `,
    backgroundSize: '100px 100px, 100px 100px, 20px 20px, 20px 20px',
    backgroundPosition: '0 0, 0 0, 0 0, 0 0',
  }}
/>
```

### 2. 侧边栏折叠按钮位置调整 (markdown-editor.tsx)

#### 左侧面板折叠按钮
- 位置：从左侧绝对定位改为面板内部右侧中间
- 使用 `absolute -right-3 top-1/2` 定位
- 当面板收起时，在外部左侧显示展开按钮

#### 右侧面板折叠按钮
- 位置：从右侧绝对定位改为面板内部左侧中间
- 使用 `absolute -left-3 top-1/2` 定位
- 当面板收起时，在外部右侧显示展开按钮

### 3. 主题色适配
所有按钮颜色跟随主题切换：
- 背景色：`themeConfig.card`
- 边框色：`themeConfig.border`
- 文字/图标色：`themeConfig.text`
- 添加阴影效果提升视觉层次

## 技术细节

### 按钮样式
```tsx
<Button
  variant="ghost"
  size="icon"
  className="absolute -right-3 top-1/2 z-10 h-10 w-6 -translate-y-1/2 rounded-l-md rounded-r-none border shadow-sm transition-all hover:shadow-md"
  style={{
    backgroundColor: themeConfig.card,
    borderColor: themeConfig.border,
    color: themeConfig.text,
  }}
>
  <ChevronLeft className="h-4 w-4" />
</Button>
```

### 主题配置
通过 `useThemeStore` 获取当前主题配置，确保按钮颜色随主题变化：
- Light 模式：白色背景、灰色边框、深色文字
- Dark 模式：深色卡片背景、深色边框、浅色文字
- Reading 模式：护眼色背景、暖色边框、深褐色文字

## 用户体验改进
1. 按钮位于面板内部，不会遮挡画布内容
2. 按钮位置在中间，符合用户操作习惯
3. 主题色适配确保在各种主题下都有良好的可见性
4. 添加悬停阴影效果，提升交互反馈
