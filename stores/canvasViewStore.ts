import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CanvasViewMode = 'flow' | 'prototype' | 'split'

interface CanvasViewStore {
  mode: CanvasViewMode
  setMode: (mode: CanvasViewMode) => void
}

export const useCanvasViewStore = create<CanvasViewStore>()(
  persist(
    (set) => ({
      mode: 'flow',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'canvas-view-store',
    }
  )
)

export default useCanvasViewStore
