export type ISODate = string
export type ISODateTime = string

export type Priority = 'low' | 'medium' | 'high' | 'critical'

export type RecurrenceFrequency =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'custom_days'
  | 'custom_weeks'
  | 'custom_months'
  | 'custom_years'

export type AnchorMode = 'schedule' | 'completion'

export type ItemStatus = 'active' | 'completed' | 'deleted'

export interface DateOnlyDueInput {
  kind: 'date'
  date: ISODate
}

export interface TimedDueInput {
  kind: 'datetime'
  at: ISODateTime
}

export type DueInput = DateOnlyDueInput | TimedDueInput

export interface DueItem {
  id: number
  title: string
  notes: string
  due_at_utc: ISODateTime
  is_date_only: boolean
  due_local_date: ISODate
  due_local_time: string | null
  category: string | null
  priority: Priority
  amount_cents: number | null
  recurrence_freq: RecurrenceFrequency
  recurrence_interval: number
  recurrence_anchor_mode: AnchorMode
  recurrence_anchor_day: number | null
  recurrence_end_date: ISODate | null
  recurrence_remaining_count: number | null
  status: ItemStatus
  is_recurring: boolean
  created_at_utc: ISODateTime
  updated_at_utc: ISODateTime
}

export interface ItemCreate {
  title: string
  due: DueInput
  notes?: string
  category?: string | null
  priority?: Priority
  amount_cents?: number | null
  recurrence_freq?: RecurrenceFrequency
  recurrence_interval?: number
  recurrence_anchor_mode?: AnchorMode
  recurrence_anchor_day?: number | null
  recurrence_end_date?: ISODate | null
  recurrence_remaining_count?: number | null
}

export interface ItemUpdate {
  title?: string
  due?: DueInput
  notes?: string
  category?: string | null
  priority?: Priority
  amount_cents?: number | null
  recurrence_freq?: RecurrenceFrequency
  recurrence_interval?: number
  recurrence_anchor_mode?: AnchorMode
  recurrence_anchor_day?: number | null
  recurrence_end_date?: ISODate | null
  recurrence_remaining_count?: number | null
}

export interface DashboardSummary {
  overdue_count: number
  due_today_count: number
  upcoming_total_cents: number
}

export interface Buckets {
  overdue: DueItem[]
  due_today: DueItem[]
  upcoming: DueItem[]
  later: DueItem[]
}

export interface ItemListResponse {
  buckets: Buckets
  summary: DashboardSummary
  currency_code: string
  timezone: string
}

export interface CompletionLog {
  id: number
  item_id: number | null
  scheduled_due_at_utc: ISODateTime
  completed_at_utc: ISODateTime
  previous_state: DueItem
  spawned_next_occurrence: boolean
  next_due_at_utc: ISODateTime | null
  can_undo: boolean
}

export interface CompleteResponse {
  log: CompletionLog
  item: DueItem | null
}

export interface UndoResponse {
  restored_item: DueItem
  preserved_touched_occurrence: boolean
  warning: string | null
}

export interface HistoryResponse {
  entries: CompletionLog[]
  total: number
}

export type Urgency = 'overdue' | 'due_now' | 'within_24h' | 'within_7d' | 'later'

export interface TimelineEntry {
  item: DueItem
  urgency: Urgency
  seconds_until_due: number
}

export interface TimelineResponse {
  reference_time_utc: ISODateTime
  timezone: string
  currency_code: string
  entries: TimelineEntry[]
}

export interface ValidationErrorItem {
  loc: Array<string | number>
  msg: string
  type: string
}

export interface ValidationError {
  detail: ValidationErrorItem[]
}

export interface ErrorResponse {
  detail: string
}
