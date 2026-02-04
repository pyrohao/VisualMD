'use client'

/**
 * 虚拟根节点编辑器组件
 * 用于编辑 Metadata 元数据
 *
 * 设计原则：
 * - 受控组件模式：所有数据由父组件通过 props 提供
 * - 实时同步：任何变化立即通过 onChange 通知父组件
 * - 无本地状态缓存：不缓存 entries，直接使用 props
 */

import { useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { FileJson, FileText, Info, Plus, Trash } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'

export interface MetadataEntry {
  key: string
  value: string
}

interface VirtualRootEditorProps {
  entries: MetadataEntry[]
  fileName?: string
  themeConfig: {
    card: string
    border: string
    text: string
    heading: string
    muted: string
    accent: string
    danger: string
  }
  onEntriesChange: (entries: MetadataEntry[]) => void
  onFileNameChange?: (fileName: string) => void
}

export interface VirtualRootEditorRef {
  getEntries: () => MetadataEntry[]
}

export const VirtualRootEditor = forwardRef<VirtualRootEditorRef, VirtualRootEditorProps>(function VirtualRootEditor({
  entries,
  fileName,
  themeConfig,
  onEntriesChange,
  onFileNameChange,
}, ref) {
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [editField, setEditField] = useState<'key' | 'value' | null>(null)
  const [editContent, setEditContent] = useState('')

  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [isEditingNew, setIsEditingNew] = useState(false)
  const [editingNewField, setEditingNewField] = useState<'key' | 'value' | null>(null)

  const [isEditingFileName, setIsEditingFileName] = useState(false)
  const [editFileNameContent, setEditFileNameContent] = useState('')

  const entriesRef = useRef(entries)
  entriesRef.current = entries

  useImperativeHandle(ref, () => ({
    getEntries: () => entriesRef.current,
  }), [])

  const updateEntry = useCallback((index: number, field: 'key' | 'value', value: string) => {
    // 值未变化时跳过，避免无意义的状态更新
    if (entries[index]?.[field] === value) return
    const newEntries = [...entries]
    newEntries[index] = { ...newEntries[index], [field]: value }
    onEntriesChange(newEntries)
  }, [entries, onEntriesChange])

  const addEntry = useCallback(() => {
    if (!newKey.trim()) return
    const newEntries = [...entries, { key: newKey.trim(), value: newValue }]
    onEntriesChange(newEntries)
    setNewKey('')
    setNewValue('')
    setIsEditingNew(false)
    setEditingNewField(null)
  }, [entries, newKey, newValue, onEntriesChange])

  const deleteEntry = useCallback((index: number) => {
    const newEntries = entries.filter((_, i) => i !== index)
    onEntriesChange(newEntries)
    if (editIndex === index) {
      setEditIndex(null)
      setEditField(null)
      setEditContent('')
    }
  }, [entries, editIndex, onEntriesChange])

  const handleSelectEntry = useCallback((index: number, field: 'key' | 'value') => {
    if (isEditingNew && editingNewField) {
      if (editingNewField === 'key') {
        setNewKey(editContent)
      } else {
        setNewValue(editContent)
      }
    }

    setIsEditingNew(false)
    setEditingNewField(null)
    setEditIndex(index)
    setEditField(field)
    setEditContent(entries[index]?.[field] || '')
  }, [entries, isEditingNew, editingNewField, editContent])

  const handleSelectNew = useCallback((field: 'key' | 'value') => {
    if (editIndex !== null && editField !== null) {
      updateEntry(editIndex, editField, editContent)
    }

    setEditIndex(null)
    setEditField(null)
    setIsEditingNew(true)
    setEditingNewField(field)
    setEditContent(field === 'key' ? newKey : newValue)
  }, [editIndex, editField, editContent, newKey, newValue, updateEntry])

  const handleSelectFileName = useCallback(() => {
    if (editIndex !== null && editField !== null) {
      updateEntry(editIndex, editField, editContent)
      setEditIndex(null)
      setEditField(null)
    }
    if (isEditingNew && editingNewField) {
      if (editingNewField === 'key') {
        setNewKey(editContent)
      } else {
        setNewValue(editContent)
      }
      setIsEditingNew(false)
      setEditingNewField(null)
    }

    setIsEditingFileName(true)
    setEditFileNameContent(fileName?.replace(/\.md$/, '') || '')
  }, [editIndex, editField, editContent, isEditingNew, editingNewField, fileName, updateEntry])

  const handleEditChange = useCallback((content: string) => {
    setEditContent(content)
  }, [])

  const handleEditBlur = useCallback(() => {
    if (isEditingFileName && onFileNameChange) {
      const fileNameWithExt = editFileNameContent.endsWith('.md')
        ? editFileNameContent
        : `${editFileNameContent}.md`
      onFileNameChange(fileNameWithExt)
      setIsEditingFileName(false)
      setEditFileNameContent('')
      return
    }

    if (isEditingNew && editingNewField) {
      if (editingNewField === 'key') {
        setNewKey(editContent)
      } else {
        setNewValue(editContent)
      }
      setIsEditingNew(false)
      setEditingNewField(null)
      return
    }

    if (editIndex !== null && editField !== null) {
      updateEntry(editIndex, editField, editContent)
      setEditIndex(null)
      setEditField(null)
    }
  }, [isEditingFileName, editFileNameContent, onFileNameChange, isEditingNew, editingNewField, editIndex, editField, editContent, updateEntry])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleEditBlur()
    }
    if (e.key === 'Escape') {
      setEditIndex(null)
      setEditField(null)
      setEditContent('')
      setIsEditingNew(false)
      setEditingNewField(null)
      setIsEditingFileName(false)
      setEditFileNameContent('')
    }
  }, [handleEditBlur])

  const getEditLabel = () => {
    if (isEditingFileName) return '编辑文件名'
    if (isEditingNew && editingNewField) {
      return editingNewField === 'key' ? '编辑新键' : '编辑新值'
    }
    if (editIndex === null || editField === null) return '点击上方键或值进行编辑'
    return editField === 'key' ? '编辑键' : '编辑值'
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium" style={{ color: themeConfig.heading }}>
        <FileJson className="w-4 h-4" style={{ color: themeConfig.accent }} />
        Metadata
      </label>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium" style={{ color: themeConfig.muted }}>
          <Info className="w-3 h-3" />
          文件名
        </label>
        <button
          onClick={handleSelectFileName}
          className="w-full h-10 px-3 text-sm text-left rounded-md border-2 transition-colors overflow-hidden text-ellipsis whitespace-nowrap"
          style={{
            backgroundColor: isEditingFileName ? themeConfig.accent + '20' : themeConfig.card,
            borderColor: isEditingFileName ? themeConfig.accent : themeConfig.border,
            color: themeConfig.text,
          }}
        >
          {fileName || <span style={{ color: themeConfig.muted }}>未命名文档.md</span>}
        </button>
      </div>

      <div className="border-t" style={{ borderColor: themeConfig.border }} />

      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        <label className="flex items-center gap-2 text-xs font-medium" style={{ color: themeConfig.muted }}>
          <Info className="w-3 h-3" />
          点击键或值在下方编辑
        </label>
        {entries.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <button
              onClick={() => handleSelectEntry(index, 'key')}
              className="flex-1 h-10 px-3 text-sm text-left rounded-md border-2 transition-colors overflow-hidden text-ellipsis whitespace-nowrap"
              style={{
                backgroundColor: editIndex === index && editField === 'key' ? themeConfig.accent + '20' : themeConfig.card,
                borderColor: editIndex === index && editField === 'key' ? themeConfig.accent : themeConfig.border,
                color: themeConfig.text,
              }}
            >
              {entry.key || <span style={{ color: themeConfig.muted }}>键</span>}
            </button>
            <span style={{ color: themeConfig.muted }}>:</span>
            <button
              onClick={() => handleSelectEntry(index, 'value')}
              className="flex-[2] h-10 px-3 text-sm text-left rounded-md border-2 transition-colors overflow-hidden text-ellipsis whitespace-nowrap"
              style={{
                backgroundColor: editIndex === index && editField === 'value' ? themeConfig.accent + '20' : themeConfig.card,
                borderColor: editIndex === index && editField === 'value' ? themeConfig.accent : themeConfig.border,
                color: themeConfig.text,
              }}
            >
              {entry.value || <span style={{ color: themeConfig.muted }}>值</span>}
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteEntry(index)}
              className="h-10 w-10 shrink-0 hover:bg-red-50"
              style={{ color: themeConfig.danger }}
            >
              <Trash className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: themeConfig.border }}>
        <button
          onClick={() => handleSelectNew('key')}
          className="flex-1 h-10 px-3 text-sm text-left rounded-md border-2 transition-colors overflow-hidden text-ellipsis whitespace-nowrap"
          style={{
            backgroundColor: isEditingNew && editingNewField === 'key' ? themeConfig.accent + '20' : themeConfig.card,
            borderColor: isEditingNew && editingNewField === 'key' ? themeConfig.accent : themeConfig.border,
            color: themeConfig.text,
          }}
        >
          {newKey || <span style={{ color: themeConfig.muted }}>新键</span>}
        </button>
        <span style={{ color: themeConfig.muted }}>:</span>
        <button
          onClick={() => handleSelectNew('value')}
          className="flex-[2] h-10 px-3 text-sm text-left rounded-md border-2 transition-colors overflow-hidden text-ellipsis whitespace-nowrap"
          style={{
            backgroundColor: isEditingNew && editingNewField === 'value' ? themeConfig.accent + '20' : themeConfig.card,
            borderColor: isEditingNew && editingNewField === 'value' ? themeConfig.accent : themeConfig.border,
            color: themeConfig.text,
          }}
        >
          {newValue || <span style={{ color: themeConfig.muted }}>值</span>}
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={addEntry}
          disabled={!newKey.trim()}
          className="h-10 w-10 shrink-0 hover:bg-blue-100 disabled:hover:bg-transparent transition-colors"
          style={{ color: '#0969da', opacity: newKey.trim() ? 1 : 0.4 }}
        >
          <Plus className="w-5 h-5" strokeWidth={3} />
        </Button>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium" style={{ color: themeConfig.muted }}>
          <FileText className="w-3 h-3" />
          {getEditLabel()}
        </label>
        <div
          className="rounded-xl border-2 overflow-hidden"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: (editIndex !== null && editField !== null) || (isEditingNew && editingNewField !== null) || isEditingFileName
              ? themeConfig.accent
              : themeConfig.border,
            height: '200px',
          }}
        >
          <Textarea
            value={isEditingFileName ? editFileNameContent : editContent}
            onChange={(e) => isEditingFileName ? setEditFileNameContent(e.target.value) : handleEditChange(e.target.value)}
            onBlur={handleEditBlur}
            onKeyDown={handleKeyDown}
            placeholder={isEditingFileName
              ? '在此输入文件名，按 Enter 保存...'
              : (editIndex !== null && editField !== null) || (isEditingNew && editingNewField !== null)
                ? `在此输入${(editField === 'key' || editingNewField === 'key') ? '键' : '值'}，按 Enter 保存...`
                : '点击上方的键或值，在此处编辑长内容'}
            disabled={editIndex === null && editField === null && !isEditingNew && !isEditingFileName}
            className="w-full h-full resize-none border-0 font-mono text-sm leading-relaxed p-4 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
            style={{ backgroundColor: 'transparent', color: themeConfig.text }}
          />
        </div>
      </div>

      <p className="text-xs flex items-center gap-1" style={{ color: themeConfig.muted }}>
        <Info className="w-3 h-3" />
        Metadata 将保存为 YAML 格式
      </p>
    </div>
  )
})

export default VirtualRootEditor
