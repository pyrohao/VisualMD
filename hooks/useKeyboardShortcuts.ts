/**
 * 键盘快捷键 Hook
 * 
 * 提供编辑器全局快捷键支持：
 * - Ctrl+Z / Cmd+Z: 撤销
 * - Ctrl+Y / Cmd+Shift+Z: 重做
 * - Ctrl+S / Cmd+S: 保存
 * 
 * 使用方法：
 * const { canUndo, canRedo } = useKeyboardShortcuts()
 */

import { useEffect, useCallback } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import { useHistoryStore } from '@/stores/historyStore'

/**
 * 键盘快捷键配置
 */
interface KeyboardShortcutsOptions {
  /** 是否启用撤销/重做 */
  enableUndoRedo?: boolean
  /** 是否启用保存 */
  enableSave?: boolean
  /** 保存回调 */
  onSave?: () => void
  /** 是否禁用（当在输入框中时） */
  disabled?: boolean
}

/**
 * 使用键盘快捷键
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const { 
    enableUndoRedo = true, 
    enableSave = true, 
    onSave,
    disabled = false 
  } = options

  const { undo, redo, canUndo, canRedo } = useDocumentStore()
  const historyCanUndo = useHistoryStore(state => state.canUndo())
  const historyCanRedo = useHistoryStore(state => state.canRedo())

  /**
   * 检查目标元素是否是输入元素
   */
  const isInputElement = useCallback((target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false
    
    const tagName = target.tagName.toLowerCase()
    const isContentEditable = target.isContentEditable
    const isInput = ['input', 'textarea', 'select'].includes(tagName)
    
    return isInput || isContentEditable
  }, [])

  /**
   * 处理键盘事件
   */
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // 如果禁用或目标元素是输入框，不处理（除非是Ctrl+S）
    if (disabled) return
    
    const { key, ctrlKey, metaKey, shiftKey, target } = event
    const isModKey = ctrlKey || metaKey // Ctrl on Windows/Linux, Cmd on Mac
    
    // 撤销: Ctrl+Z / Cmd+Z
    if (enableUndoRedo && isModKey && key.toLowerCase() === 'z' && !shiftKey) {
      // 如果在输入框中，不拦截（让输入框自己处理）
      if (isInputElement(target)) return
      
      event.preventDefault()
      if (canUndo()) {
        undo()
        console.log('[Undo] 撤销操作')
      } else {
        console.log('[Undo] 无法撤销')
      }
      return
    }
    
    // 重做: Ctrl+Y 或 Ctrl+Shift+Z / Cmd+Shift+Z
    if (enableUndoRedo && isModKey) {
      const isRedoKey = key.toLowerCase() === 'y' || (key.toLowerCase() === 'z' && shiftKey)
      
      if (isRedoKey) {
        // 如果在输入框中，不拦截
        if (isInputElement(target)) return
        
        event.preventDefault()
        if (canRedo()) {
          redo()
          console.log('[Redo] 重做操作')
        } else {
          console.log('[Redo] 无法重做')
        }
        return
      }
    }
    
    // 保存: Ctrl+S / Cmd+S
    if (enableSave && isModKey && key.toLowerCase() === 's') {
      event.preventDefault()
      onSave?.()
      console.log('[Save] 保存文档')
      return
    }
  }, [enableUndoRedo, enableSave, disabled, undo, redo, canUndo, canRedo, onSave, isInputElement])

  useEffect(() => {
    // 添加键盘事件监听
    document.addEventListener('keydown', handleKeyDown)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  return {
    canUndo: historyCanUndo,
    canRedo: historyCanRedo,
  }
}

export default useKeyboardShortcuts
