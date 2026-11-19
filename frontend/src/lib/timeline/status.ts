import type { Priority, Urgency } from '@/api/types'

export const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: 'Overdue',
  due_now: 'Due now',
  within_24h: 'Within 24 hours',
  within_7d: 'Within 7 days',
  later: 'Later',
}

export const URGENCY_SHORT_LABEL: Record<Urgency, string> = {
  overdue: 'Overdue',
  due_now: 'Due now',
  within_24h: '≤24h',
  within_7d: '≤7d',
  later: 'Later',
}

export const URGENCY_CHIP_CLASS: Record<Urgency, string> = {
  overdue: 'bg-timeline-overdue-soft text-timeline-overdue',
  due_now: 'bg-timeline-now/10 text-timeline-now',
  within_24h: 'bg-timeline-imminent-soft text-timeline-imminent',
  within_7d: 'bg-timeline-soon-soft text-timeline-soon',
  later: 'bg-timeline-later-soft text-timeline-later',
}

export const PRIORITY_SHORT_LABEL: Record<Priority, string> = {
  critical: 'C',
  high: 'H',
  medium: 'M',
  low: 'L',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export function markerSide(urgency: Urgency): 'above' | 'below' {
  return urgency === 'overdue' ? 'below' : 'above'
}
