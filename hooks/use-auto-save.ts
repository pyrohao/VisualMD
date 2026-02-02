'use client'

/**
 * 自动保存 Hook
 * 当依赖项变化时，延迟指定时间后执行保存操作
 */

import { useEffect, useRef, useCallback } from 'react'

interface UseAutoSaveOptions {
  /** 延迟时间（毫秒），默认 1000ms */
  delay?: number
  /** 是否启用自动保存 */
  enabled?: boolean
}

/**
 * 自动保存 Hook
 * @param saveFn 保存函数
 * @param deps 依赖项数组，当这些值变化时触发保存
 * @param options 配置选项
 */
export function useAutoSave(
  saveFn: () => void,
  deps: React.DependencyList,
  options: UseAutoSaveOptions = {}
) {
  const { delay = 1000, enabled = true } = options
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isFirstRender = useRef(true)

  // 清理函数
  const clearAutoSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // 立即保存
  const saveImmediately = useCallback(() => {
    clearAutoSave()
    saveFn()
  }, [saveFn, clearAutoSave])

  useEffect(() => {
    // 首次渲染不触发自动保存
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    // 如果禁用自动保存，直接返回
    if (!enabled) {
      return
    }

    // 清除之前的定时器
    clearAutoSave()

    // 设置新的定时器
    timeoutRef.current = setTimeout(() => {
      saveFn()
    }, delay)

    // 组件卸载时清理
    return () => {
      clearAutoSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delay, enabled])

  return {
    clearAutoSave,
    saveImmediately,
  }
}

export default useAutoSave
