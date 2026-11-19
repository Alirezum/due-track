import { useRef } from 'react'
import { HORIZONS, type TimeHorizon } from '@/lib/timeline/horizons'
import { cn } from '@/lib/utils'

type HorizonControlProps = {
  value: TimeHorizon
  onChange: (horizon: TimeHorizon) => void
}

export function HorizonControl({ value, onChange }: HorizonControlProps) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([])

  function moveFocus(direction: 1 | -1, index: number) {
    const nextIndex = (index + direction + HORIZONS.length) % HORIZONS.length
    const next = HORIZONS[nextIndex]
    onChange(next.value)
    buttonsRef.current[nextIndex]?.focus()
  }

  return (
    <div
      role="group"
      aria-label="Time horizon"
      className="inline-flex flex-wrap items-stretch overflow-hidden rounded-[3px] border border-border"
    >
      {HORIZONS.map((horizon, index) => {
        const selected = horizon.value === value
        return (
          <button
            key={horizon.value}
            ref={(node) => {
              buttonsRef.current[index] = node
            }}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(horizon.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault()
                moveFocus(1, index)
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault()
                moveFocus(-1, index)
              } else if (event.key === 'Home') {
                event.preventDefault()
                onChange(HORIZONS[0].value)
                buttonsRef.current[0]?.focus()
              } else if (event.key === 'End') {
                event.preventDefault()
                onChange(HORIZONS.at(-1)!.value)
                buttonsRef.current[HORIZONS.length - 1]?.focus()
              }
            }}
            className={cn(
              'min-h-10 min-w-11 border-r border-border px-2.5 font-sans text-[0.8125rem] leading-none font-semibold outline-none transition-colors last:border-r-0 focus-visible:ring-[3px] focus-visible:ring-ring/50',
              selected
                ? 'bg-foreground text-background'
                : 'bg-timeline-paper text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {horizon.label}
          </button>
        )
      })}
    </div>
  )
}
