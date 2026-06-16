'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DEFAULT_AI_DOCK_WIDTH = 0
const MIN_AI_DOCK_WIDTH = 320

interface AiDockStore {
  isOpen: boolean
  width: number
  hasCustomWidth: boolean
  open: () => void
  close: () => void
  toggle: () => void
  setOpen: (isOpen: boolean) => void
  setWidth: (width: number) => void
  primeWidth: (width: number) => void
}

export const useAiDockStore = create<AiDockStore>()(
  persist(
    (set, get) => ({
      isOpen: false,
      width: DEFAULT_AI_DOCK_WIDTH,
      hasCustomWidth: false,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set({ isOpen: !get().isOpen }),
      setOpen: (isOpen) => set({ isOpen }),
      setWidth: (width) => {
        set({
          width: Math.max(MIN_AI_DOCK_WIDTH, Math.round(width)),
          hasCustomWidth: true,
        })
      },
      primeWidth: (width) => {
        set((state) => {
          if (state.hasCustomWidth) {
            return state
          }

          return {
            width: Math.max(MIN_AI_DOCK_WIDTH, Math.round(width)),
            hasCustomWidth: false,
          }
        })
      },
    }),
    {
      name: 'ai-dock-store',
      partialize: (state) => ({
        isOpen: state.isOpen,
        width: state.width,
        hasCustomWidth: state.hasCustomWidth,
      }),
    }
  )
)

export { DEFAULT_AI_DOCK_WIDTH, MIN_AI_DOCK_WIDTH }
