import { useMemo } from 'react'
import {
  buildTicks,
  chooseTickInterval,
  positionFor,
} from '@/lib/timeline/geometry'
import { formatTimelineTick } from '@/lib/timeline/format'
import type { TimelineWindow } from '@/lib/timeline/horizons'
import { cn } from '@/lib/utils'

type TimelineAxisProps = {
  window: TimelineWindow
  width: number
  timezone: string
  liveNowMs: number
}

export function TimelineAxis({ window, width, timezone, liveNowMs }: TimelineAxisProps) {
  const { ticks, interval } = useMemo(() => {
    const chosen = chooseTickInterval(window.startMs, window.endMs, width, window.horizon)
    return {
      ticks: buildTicks(window.startMs, window.endMs, chosen, timezone),
      interval: chosen,
    }
  }, [timezone, width, window.endMs, window.startMs, window.horizon])

  const nowRatio = positionFor(liveNowMs, window.startMs, window.endMs) * 100

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {ticks.map((tick, index) => {
        const ratio = positionFor(tick, window.startMs, window.endMs) * 100
        return (
          <span key={`${tick}-${index}`} className="absolute inset-y-0" style={{ left: `${ratio}%` }}>
            <span className="absolute inset-y-0 left-0 w-px bg-timeline-grid" />
            <span className="absolute top-1/2 left-0 h-2 w-px -translate-y-1/2 bg-timeline-tick/70" />
            <span
              className={cn(
                'absolute top-[calc(50%+0.75rem)] left-0 -translate-x-1/2 font-sans text-[0.6875rem] leading-none font-semibold tracking-[0.08em] whitespace-nowrap text-timeline-tick uppercase tabular-nums',
                interval.unit === 'minute' || interval.unit === 'hour' ? 'text-[0.625rem]' : '',
              )}
            >
              {formatTimelineTick(new Date(tick).toISOString(), timezone, window.horizon)}
            </span>
          </span>
        )
      })}

      <span className="absolute inset-x-0 top-1/2 h-px bg-timeline-rule" />

      <span
        className="absolute inset-y-0 z-20"
        style={{ left: `${nowRatio}%` }}
        data-testid="timeline-now"
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-timeline-now/70" />
        <span className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-timeline-now-foreground/40 bg-timeline-now" />
        <span className="absolute top-[calc(50%+0.55rem)] left-1/2 -translate-x-1/2 rounded-[2px] bg-timeline-now px-1.5 py-0.5 font-sans text-[0.625rem] leading-none font-bold tracking-[0.1em] text-timeline-now-foreground">
          NOW
        </span>
      </span>
    </div>
  )
}
