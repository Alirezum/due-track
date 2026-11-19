export function TimelineLegend() {
  return (
    <section
      aria-label="Timeline legend"
      className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 pt-3 text-[0.6875rem] text-muted-foreground"
    >
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-timeline-imminent" />
        Future rises above the rule
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-2.5 w-2 bg-timeline-overdue"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% 62%, 50% 100%, 0 62%)' }}
        />
        Overdue hangs below
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rotate-45 bg-timeline-now" />
        Now
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[1px] border-2 border-timeline-later" />
        Date-only
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-2 border-timeline-soon" />
        Within 7 days
      </span>
    </section>
  )
}
