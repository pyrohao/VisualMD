'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

function Switch({
  className,
  style,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border shadow-xs outline-none transition-all disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=unchecked]:border-[var(--switch-off-border,transparent)] data-[state=unchecked]:bg-[var(--switch-off-bg)] data-[state=checked]:border-[var(--switch-on-border,transparent)] data-[state=checked]:bg-[var(--switch-on-bg)]',
        className,
      )}
      style={{
        '--switch-off-bg': 'var(--input)',
        '--switch-off-border': 'var(--border)',
        '--switch-on-bg': 'var(--primary)',
        '--switch-on-border': 'var(--primary)',
        '--switch-thumb-off': 'var(--background)',
        '--switch-thumb-on': 'var(--primary-foreground)',
        ...(style || {}),
      } as React.CSSProperties}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={
          'pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:bg-[var(--switch-thumb-off)] data-[state=checked]:bg-[var(--switch-thumb-on)]'
        }
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
