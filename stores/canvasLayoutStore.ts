import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CanvasLayoutMode = 'balanced' | 'left' | 'right' | 'down'

interface CanvasLayoutStore {
  mode: CanvasLayoutMode
  setMode: (mode: CanvasLayoutMode) => void
}

export const useCanvasLayoutStore = create<CanvasLayoutStore>()(
  persist(
    (set) => ({
      mode: 'balanced',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'canvas-layout-store',
    }
  )
)

export default useCanvasLayoutStore
