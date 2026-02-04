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
import { useTranslation } from '@/stores/languageStore'

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
  const { t } = useTranslation()
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
    if (isEditingFileName) return t('node.editFileName')
    if (isEditingNew && editingNewField) {
      return editingNewField === 'key' ? t('node.editNewKey') : t('node.editNewValue')
    }
    if (editIndex === null || editField === null) return t('node.clickToEdit')
    return editField === 'key' ? t('node.editKey') : t('node.editValue')
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
          {t('node.fileName')}
        </label>
        <button
          onClick={handleSelectFileName}
          className="w-full h-10 px-3 text-sm text-left rounded-md border-2 transition-all duration-200 overflow-hidden text-ellipsis whitespace-nowrap shadow-sm hover:shadow-md"
          style={{
            backgroundColor: isEditingFileName ? themeConfig.accent + '30' : themeConfig.card,
            borderColor: isEditingFileName ? themeConfig.accent : themeConfig.border,
            color: themeConfig.text,
            boxShadow: isEditingFileName
              ? `0 2px 8px ${themeConfig.accent}40, inset 0 1px 0 ${themeConfig.accent}20`
              : `0 1px 3px ${themeConfig.border}60, inset 0 1px 0 ${themeConfig.card}`,
          }}
        >
          {fileName || <span style={{ color: themeConfig.muted }}>{t('node.untitledDoc')}</span>}
        </button>
      </div>

      <div className="border-t" style={{ borderColor: themeConfig.border }} />

      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        <label className="flex items-center gap-2 text-xs font-medium" style={{ color: themeConfig.muted }}>
          <Info className="w-3 h-3" />
          {t('node.clickKeyOrValue')}
        </label>
        {entries.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 group">
            <button
              onClick={() => handleSelectEntry(index, 'key')}
              className="flex-1 h-10 px-3 text-sm text-left rounded-md border-2 transition-all duration-200 overflow-hidden text-ellipsis whitespace-nowrap shadow-sm hover:shadow-md"
              style={{
                backgroundColor: editIndex === index && editField === 'key' ? themeConfig.accent + '30' : themeConfig.card,
                borderColor: editIndex === index && editField === 'key' ? themeConfig.accent : themeConfig.border,
                color: themeConfig.text,
                boxShadow: editIndex === index && editField === 'key'
                  ? `0 2px 8px ${themeConfig.accent}40, inset 0 1px 0 ${themeConfig.accent}20`
                  : `0 1px 3px ${themeConfig.border}60, inset 0 1px 0 ${themeConfig.card}`,
              }}
            >
              {entry.key || <span style={{ color: themeConfig.muted }}>{t('node.key')}</span>}
            </button>
            <span style={{ color: themeConfig.muted }}>:</span>
            <button
              onClick={() => handleSelectEntry(index, 'value')}
              className="flex-[2] h-10 px-3 text-sm text-left rounded-md border-2 transition-all duration-200 overflow-hidden text-ellipsis whitespace-nowrap shadow-sm hover:shadow-md"
              style={{
                backgroundColor: editIndex === index && editField === 'value' ? themeConfig.accent + '30' : themeConfig.card,
                borderColor: editIndex === index && editField === 'value' ? themeConfig.accent : themeConfig.border,
                color: themeConfig.text,
                boxShadow: editIndex === index && editField === 'value'
                  ? `0 2px 8px ${themeConfig.accent}40, inset 0 1px 0 ${themeConfig.accent}20`
                  : `0 1px 3px ${themeConfig.border}60, inset 0 1px 0 ${themeConfig.card}`,
              }}
            >
              {entry.value || <span style={{ color: themeConfig.muted }}>{t('node.value')}</span>}
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteEntry(index)}
              className="h-10 w-10 shrink-0 transition-all duration-200 hover:shadow-md"
              style={{
                color: themeConfig.danger,
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `${themeConfig.danger}20`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <Trash className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: themeConfig.border }}>
        <button
          onClick={() => handleSelectNew('key')}
          className="flex-1 h-10 px-3 text-sm text-left rounded-md border-2 transition-all duration-200 overflow-hidden text-ellipsis whitespace-nowrap shadow-sm hover:shadow-md"
          style={{
            backgroundColor: isEditingNew && editingNewField === 'key' ? themeConfig.accent + '30' : themeConfig.card,
            borderColor: isEditingNew && editingNewField === 'key' ? themeConfig.accent : themeConfig.border,
            color: themeConfig.text,
            boxShadow: isEditingNew && editingNewField === 'key'
              ? `0 2px 8px ${themeConfig.accent}40, inset 0 1px 0 ${themeConfig.accent}20`
              : `0 1px 3px ${themeConfig.border}60, inset 0 1px 0 ${themeConfig.card}`,
          }}
        >
          {newKey || <span style={{ color: themeConfig.muted }}>{t('node.newKey')}</span>}
        </button>
        <span style={{ color: themeConfig.muted }}>:</span>
        <button
          onClick={() => handleSelectNew('value')}
          className="flex-[2] h-10 px-3 text-sm text-left rounded-md border-2 transition-all duration-200 overflow-hidden text-ellipsis whitespace-nowrap shadow-sm hover:shadow-md"
          style={{
            backgroundColor: isEditingNew && editingNewField === 'value' ? themeConfig.accent + '30' : themeConfig.card,
            borderColor: isEditingNew && editingNewField === 'value' ? themeConfig.accent : themeConfig.border,
            color: themeConfig.text,
            boxShadow: isEditingNew && editingNewField === 'value'
              ? `0 2px 8px ${themeConfig.accent}40, inset 0 1px 0 ${themeConfig.accent}20`
              : `0 1px 3px ${themeConfig.border}60, inset 0 1px 0 ${themeConfig.card}`,
          }}
        >
          {newValue || <span style={{ color: themeConfig.muted }}>{t('node.value')}</span>}
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={addEntry}
          disabled={!newKey.trim()}
          className="h-10 w-10 shrink-0 transition-all duration-200 hover:shadow-md"
          style={{
            color: newKey.trim() ? themeConfig.accent : themeConfig.muted,
            backgroundColor: newKey.trim() ? `${themeConfig.accent}20` : `${themeConfig.border}30`,
            opacity: newKey.trim() ? 1 : 0.5,
          }}
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
          className="rounded-xl border-2 overflow-hidden transition-all duration-200"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: (editIndex !== null && editField !== null) || (isEditingNew && editingNewField !== null) || isEditingFileName
              ? themeConfig.accent
              : themeConfig.border,
            height: '160px',
            boxShadow: (editIndex !== null && editField !== null) || (isEditingNew && editingNewField !== null) || isEditingFileName
              ? `0 4px 12px ${themeConfig.accent}30, inset 0 1px 0 ${themeConfig.accent}15`
              : `0 2px 6px ${themeConfig.border}40, inset 0 1px 0 ${themeConfig.card}`,
          }}
        >
          <Textarea
            value={isEditingFileName ? editFileNameContent : editContent}
            onChange={(e) => isEditingFileName ? setEditFileNameContent(e.target.value) : handleEditChange(e.target.value)}
            onBlur={handleEditBlur}
            onKeyDown={handleKeyDown}
            placeholder={isEditingFileName
              ? t('node.enterFileNamePlaceholder')
              : (editIndex !== null && editField !== null) || (isEditingNew && editingNewField !== null)
                ? (editField === 'key' || editingNewField === 'key') ? t('node.enterKeyPlaceholder') : t('node.enterValuePlaceholder')
                : t('node.clickToEditLongContent')}
            disabled={editIndex === null && editField === null && !isEditingNew && !isEditingFileName}
            className="w-full h-full resize-none border-0 font-mono text-sm leading-relaxed p-4 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
            style={{ backgroundColor: 'transparent', color: themeConfig.text }}
          />
        </div>
      </div>

      <p className="text-xs flex items-center gap-1" style={{ color: themeConfig.muted }}>
        <Info className="w-3 h-3" />
        {t('node.metadataYaml')}
      </p>
    </div>
  )
})

export default VirtualRootEditor
