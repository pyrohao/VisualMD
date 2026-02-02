'use client'

/**
 * 虚拟根节点编辑器组件
 * 用于编辑 YAML Front Matter 元数据
 * 
 * 设计：
 * - 上方列表：显示所有 key-value，点击选择要编辑的项
 * - 下方编辑框：专门编辑长内容，不会失焦
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { FileJson, FileText, Info, Plus, Trash } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

interface MetadataEntry {
  key: string
  value: string
}

interface VirtualRootEditorProps {
  initialEntries: MetadataEntry[]
  themeConfig: {
    card: string
    border: string
    text: string
    heading: string
    muted: string
    accent: string
    danger: string
  }
  onChange: (entries: MetadataEntry[]) => void
}

export function VirtualRootEditor({
  initialEntries,
  themeConfig,
  onChange,
}: VirtualRootEditorProps) {
  // 本地状态
  const [entries, setEntries] = useState<MetadataEntry[]>(initialEntries)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  
  // 当前编辑状态
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [editField, setEditField] = useState<'key' | 'value' | null>(null)
  const [editContent, setEditContent] = useState('')
  
  // 防止循环更新
  const isExternalUpdate = useRef(false)

  // 外部数据变化时同步
  useEffect(() => {
    isExternalUpdate.current = true
    setEntries(initialEntries)
    setEditIndex(null)
    setEditField(null)
    setEditContent('')
    setNewKey('')
    setNewValue('')
  }, [initialEntries])

  // 通知父组件
  useEffect(() => {
    if (isExternalUpdate.current) {
      isExternalUpdate.current = false
      return
    }
    onChange(entries)
  }, [entries, onChange])

  // 选择要编辑的字段
  const handleSelect = useCallback((index: number, field: 'key' | 'value') => {
    const entry = entries[index]
    if (!entry) return
    
    setEditIndex(index)
    setEditField(field)
    setEditContent(field === 'key' ? entry.key : entry.value)
  }, [entries])

  // 下方大编辑框内容变化 - 只更新本地 editContent，不立即同步到 entries
  const handleEditChange = useCallback((content: string) => {
    setEditContent(content)
  }, [])

  // 下方编辑框失去焦点时，同步到 entries
  const handleEditBlur = useCallback(() => {
    if (editIndex === null || editField === null) return
    
    setEntries(prev => {
      const updated = [...prev]
      const entry = updated[editIndex]
      if (entry) {
        if (editField === 'key') {
          updated[editIndex] = { ...entry, key: editContent }
        } else {
          updated[editIndex] = { ...entry, value: editContent }
        }
      }
      return updated
    })
  }, [editIndex, editField, editContent])

  // 添加快捷键支持（Ctrl+Enter 保存）
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleEditBlur()
    }
  }, [handleEditBlur])

  // 添加快捷键支持（Enter 保存）
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditBlur()
    }
  }, [handleEditBlur])

  // 添加快捷键支持（Escape 取消）
  const handleKeyDownCancel = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditIndex(null)
      setEditField(null)
      setEditContent('')
    }
  }, [])

  // 添加新元数据
  const handleAdd = useCallback(() => {
    if (!newKey.trim()) return
    
    setEntries(prev => [...prev, { key: newKey.trim(), value: newValue }])
    setNewKey('')
    setNewValue('')
  }, [newKey, newValue])

  // 删除元数据
  const handleDelete = useCallback((index: number) => {
    setEntries(prev => prev.filter((_, i) => i !== index))
    
    if (editIndex === index) {
      setEditIndex(null)
      setEditField(null)
      setEditContent('')
    }
  }, [editIndex])

  // 获取标签文字
  const getEditLabel = () => {
    if (editIndex === null || editField === null) return '点击上方键或值进行编辑'
    return editField === 'key' ? '编辑键' : '编辑值'
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium" style={{ color: themeConfig.heading }}>
        <FileJson className="w-4 h-4" style={{ color: themeConfig.accent }} />
        YAML 元数据
      </label>

      {/* 现有元数据列表 - 点击选择 */}
      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        <label className="flex items-center gap-2 text-xs font-medium" style={{ color: themeConfig.muted }}>
          <Info className="w-3 h-3" />
          点击键或值在下方编辑
        </label>
        {entries.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            {/* Key - 点击选择 */}
            <button
              onClick={() => handleSelect(index, 'key')}
              className="flex-1 h-10 px-3 text-sm text-left rounded-md border-2 transition-colors overflow-hidden text-ellipsis whitespace-nowrap"
              style={{
                backgroundColor: editIndex === index && editField === 'key' 
                  ? themeConfig.accent + '20' 
                  : themeConfig.card,
                borderColor: editIndex === index && editField === 'key' 
                  ? themeConfig.accent 
                  : themeConfig.border,
                color: themeConfig.text,
              }}
            >
              {entry.key || <span style={{ color: themeConfig.muted }}>键</span>}
            </button>
            <span style={{ color: themeConfig.muted }}>:</span>
            {/* Value - 点击选择 */}
            <button
              onClick={() => handleSelect(index, 'value')}
              className="flex-[2] h-10 px-3 text-sm text-left rounded-md border-2 transition-colors overflow-hidden text-ellipsis whitespace-nowrap"
              style={{
                backgroundColor: editIndex === index && editField === 'value' 
                  ? themeConfig.accent + '20' 
                  : themeConfig.card,
                borderColor: editIndex === index && editField === 'value' 
                  ? themeConfig.accent 
                  : themeConfig.border,
                color: themeConfig.text,
              }}
            >
              {entry.value || <span style={{ color: themeConfig.muted }}>值</span>}
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(index)}
              className="h-10 w-10 shrink-0 hover:bg-red-50"
              style={{ color: themeConfig.danger }}
            >
              <Trash className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* 添加新元数据 */}
      <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: themeConfig.border }}>
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="新键"
          className="flex-1 h-10 text-sm border-2"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
            color: themeConfig.text,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newKey.trim()) {
              handleAdd()
            }
          }}
        />
        <span style={{ color: themeConfig.muted }}>:</span>
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="值"
          className="flex-[2] h-10 text-sm border-2"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
            color: themeConfig.text,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newKey.trim()) {
              handleAdd()
            }
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleAdd}
          disabled={!newKey.trim()}
          className="h-10 w-10 shrink-0 hover:bg-blue-100 disabled:hover:bg-transparent transition-colors"
          style={{
            color: '#0969da',
            opacity: newKey.trim() ? 1 : 0.4,
          }}
        >
          <Plus className="w-5 h-5" strokeWidth={3} />
        </Button>
      </div>

      {/* 内容编辑框 - 专门编辑长内容 */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium" style={{ color: themeConfig.muted }}>
          <FileText className="w-3 h-3" />
          {getEditLabel()}

        </label>
        <div
          className="rounded-xl border-2 overflow-hidden"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: editIndex !== null && editField !== null 
              ? themeConfig.accent 
              : themeConfig.border,
            height: '200px',
          }}
        >
          <Textarea
            value={editContent}
            onChange={(e) => handleEditChange(e.target.value)}
            onBlur={handleEditBlur}
            onKeyDown={handleKeyDown}
            placeholder={editIndex !== null && editField !== null 
              ? `在此输入${editField === 'key' ? '键' : '值'}，按 Enter 保存...` 
              : '点击上方的键或值，在此处编辑长内容'}
            disabled={editIndex === null || editField === null}
            className="w-full h-full resize-none border-0 font-mono text-sm leading-relaxed p-4 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
            style={{
              backgroundColor: 'transparent',
              color: themeConfig.text,
            }}
          />
        </div>
      </div>

      <p className="text-xs flex items-center gap-1" style={{ color: themeConfig.muted }}>
        <Info className="w-3 h-3" />
        这些元数据将保存为 YAML Front Matter 格式
      </p>
    </div>
  )
}

export default VirtualRootEditor
