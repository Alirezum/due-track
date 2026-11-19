import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type {
  DueInput,
  DueItem,
  ItemCreate,
  ItemUpdate,
  Priority,
  RecurrenceFrequency,
} from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { categoryBadgeClass } from '@/lib/categories'
import { cn } from '@/lib/utils'

const MONTH_OR_YEAR: RecurrenceFrequency[] = [
  'monthly',
  'yearly',
  'custom_months',
  'custom_years',
]

const FREQUENCY_OPTIONS: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom_days', label: 'Every N days' },
  { value: 'custom_weeks', label: 'Every N weeks' },
  { value: 'custom_months', label: 'Every N months' },
  { value: 'custom_years', label: 'Every N years' },
]

const PRIORITY_OPTIONS: Array<{ value: Priority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

type FormState = {
  title: string
  notes: string
  dueKind: 'date' | 'datetime'
  dueDate: string
  dueTime: string
  category: string
  priority: Priority
  amount: string
  recurrenceFreq: RecurrenceFrequency
  recurrenceInterval: string
  anchorMode: 'schedule' | 'completion'
  anchorDay: string
  endDate: string
  remainingCount: string
}

type FormErrors = Partial<Record<keyof FormState | 'form', string>>

function todayForInput(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function initialFormState(item?: DueItem | null): FormState {
  if (!item) {
    return {
      title: '',
      notes: '',
      dueKind: 'date',
      dueDate: todayForInput(),
      dueTime: '09:00',
      category: '',
      priority: 'medium',
      amount: '',
      recurrenceFreq: 'none',
      recurrenceInterval: '1',
      anchorMode: 'schedule',
      anchorDay: '',
      endDate: '',
      remainingCount: '',
    }
  }

  return {
    title: item.title,
    notes: item.notes,
    dueKind: item.is_date_only ? 'date' : 'datetime',
    dueDate: item.due_local_date,
    dueTime: item.due_local_time ?? '09:00',
    category: item.category ?? '',
    priority: item.priority,
    amount: item.amount_cents === null ? '' : (item.amount_cents / 100).toFixed(2),
    recurrenceFreq: item.recurrence_freq,
    recurrenceInterval: String(item.recurrence_interval),
    anchorMode: item.recurrence_anchor_mode,
    anchorDay: item.recurrence_anchor_day === null ? '' : String(item.recurrence_anchor_day),
    endDate: item.recurrence_end_date ?? '',
    remainingCount:
      item.recurrence_remaining_count === null ? '' : String(item.recurrence_remaining_count),
  }
}

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return Math.round(Number(trimmed) * 100)
}

function parsePositiveInteger(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) ? parsed : null
}

function buildDue(form: FormState): DueInput {
  if (form.dueKind === 'date') {
    return { kind: 'date', date: form.dueDate }
  }
  const localValue = `${form.dueDate}T${form.dueTime || '09:00'}`
  return { kind: 'datetime', at: new Date(localValue).toISOString() }
}

function validateForm(form: FormState): FormErrors {
  const errors: FormErrors = {}
  const title = form.title.trim()
  if (!title) {
    errors.title = 'Enter a title.'
  } else if (title.length > 200) {
    errors.title = 'Keep the title to 200 characters or fewer.'
  }
  if (!form.dueDate) {
    errors.dueDate = 'Choose a due date.'
  }
  if (form.dueKind === 'datetime' && !form.dueTime) {
    errors.dueTime = 'Choose a due time.'
  }
  if (form.category.trim().length > 50) {
    errors.category = 'Keep the category to 50 characters or fewer.'
  }
  if (form.amount.trim()) {
    const amount = dollarsToCents(form.amount)
    if (amount === null || Number.isNaN(amount) || amount < 0) {
      errors.amount = 'Enter a zero or positive amount.'
    }
  }
  if (form.recurrenceFreq !== 'none') {
    const interval = parsePositiveInteger(form.recurrenceInterval)
    if (interval === null || interval < 1) {
      errors.recurrenceInterval = 'Enter a whole number of at least 1.'
    }
  }
  if (
    form.recurrenceFreq !== 'none' &&
    form.anchorMode === 'schedule' &&
    MONTH_OR_YEAR.includes(form.recurrenceFreq) &&
    form.anchorDay.trim()
  ) {
    const anchorDay = parsePositiveInteger(form.anchorDay)
    if (anchorDay === null || anchorDay < 1 || anchorDay > 31) {
      errors.anchorDay = 'Enter a day between 1 and 31.'
    }
  }
  if (form.endDate && form.remainingCount.trim()) {
    errors.form = 'Choose either an end date or a remaining count, not both.'
  }
  if (form.remainingCount.trim()) {
    const count = parsePositiveInteger(form.remainingCount)
    if (count === null || count < 1) {
      errors.remainingCount = 'Enter a whole number of at least 1.'
    }
  }
  return errors
}

export type ItemFormProps = {
  item?: DueItem | null
  submitLabel: string
  isSubmitting?: boolean
  serverError?: string | null
  onSubmit: (payload: ItemCreate | ItemUpdate) => Promise<void> | void
  onCancel: () => void
}

export function ItemForm({
  item,
  submitLabel,
  isSubmitting = false,
  serverError,
  onSubmit,
  onCancel,
}: ItemFormProps) {
  const [form, setForm] = useState<FormState>(() => initialFormState(item))
  const [errors, setErrors] = useState<FormErrors>({})
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const showAnchorDay =
    form.recurrenceFreq !== 'none' &&
    form.anchorMode === 'schedule' &&
    MONTH_OR_YEAR.includes(form.recurrenceFreq)
  const showInterval = form.recurrenceFreq !== 'none'
  const categoryClass = useMemo(() => categoryBadgeClass(form.category), [form.category])

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateForm(form)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    const isRecurring = form.recurrenceFreq !== 'none'
    const payload: ItemCreate = {
      title: form.title.trim(),
      due: buildDue(form),
      notes: form.notes,
      category: form.category.trim() || null,
      priority: form.priority,
      amount_cents: dollarsToCents(form.amount),
      recurrence_freq: form.recurrenceFreq,
      recurrence_interval: isRecurring ? (parsePositiveInteger(form.recurrenceInterval) ?? 1) : 1,
      recurrence_anchor_mode: isRecurring ? form.anchorMode : 'schedule',
      recurrence_anchor_day:
        isRecurring && showAnchorDay && form.anchorDay.trim()
          ? parsePositiveInteger(form.anchorDay)
          : null,
      recurrence_end_date: isRecurring && form.endDate ? form.endDate : null,
      recurrence_remaining_count:
        isRecurring && form.remainingCount.trim()
          ? parsePositiveInteger(form.remainingCount)
          : null,
    }

    await onSubmit(payload)
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="item-title">Title</Label>
        <Input
          id="item-title"
          ref={titleRef}
          value={form.title}
          onChange={(event) => update('title', event.target.value)}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? 'item-title-error' : undefined}
          maxLength={200}
          autoComplete="off"
        />
        {errors.title ? (
          <p id="item-title-error" className="text-sm text-destructive" role="alert">
            {errors.title}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="item-notes">Notes</Label>
        <Textarea
          id="item-notes"
          value={form.notes}
          onChange={(event) => update('notes', event.target.value)}
          rows={3}
          maxLength={10000}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
        <div className="grid gap-2">
          <Label htmlFor="item-due-kind">Due as</Label>
          <select
            id="item-due-kind"
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={form.dueKind}
            onChange={(event) => update('dueKind', event.target.value as FormState['dueKind'])}
          >
            <option value="date">Date</option>
            <option value="datetime">Date and time</option>
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="item-due-date">Date</Label>
            <Input
              id="item-due-date"
              type="date"
              value={form.dueDate}
              onChange={(event) => update('dueDate', event.target.value)}
              aria-invalid={errors.dueDate ? true : undefined}
            />
          </div>
          {form.dueKind === 'datetime' ? (
            <div className="grid gap-2">
              <Label htmlFor="item-due-time">Time</Label>
              <Input
                id="item-due-time"
                type="time"
                value={form.dueTime}
                onChange={(event) => update('dueTime', event.target.value)}
              />
            </div>
          ) : null}
        </div>
      </div>
      {errors.dueDate ? (
        <p className="text-sm text-destructive" role="alert">
          {errors.dueDate}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="item-category">Category</Label>
          <div className="flex items-center gap-2">
            <Input
              id="item-category"
              value={form.category}
              onChange={(event) => update('category', event.target.value)}
              maxLength={50}
              placeholder="Bills, health, work…"
              autoComplete="off"
            />
            {categoryClass ? (
              <span
                aria-hidden="true"
                className={cn('size-6 shrink-0 rounded-full border', categoryClass)}
              />
            ) : null}
          </div>
          {errors.category ? (
            <p className="text-sm text-destructive" role="alert">
              {errors.category}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="item-priority">Priority</Label>
          <select
            id="item-priority"
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={form.priority}
            onChange={(event) => update('priority', event.target.value as Priority)}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="item-amount">Amount</Label>
        <Input
          id="item-amount"
          inputMode="decimal"
          value={form.amount}
          onChange={(event) => update('amount', event.target.value)}
          placeholder="0.00"
          aria-invalid={errors.amount ? true : undefined}
        />
        {errors.amount ? (
          <p className="text-sm text-destructive" role="alert">
            {errors.amount}
          </p>
        ) : null}
      </div>

      <fieldset className="grid gap-4 rounded-md border border-border/80 p-4">
        <legend className="px-1 text-sm font-medium">Repeat</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="item-recurrence-freq">Frequency</Label>
            <select
              id="item-recurrence-freq"
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={form.recurrenceFreq}
              onChange={(event) =>
                update('recurrenceFreq', event.target.value as RecurrenceFrequency)
              }
            >
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {showInterval ? (
            <div className="grid gap-2">
              <Label htmlFor="item-recurrence-interval">Every</Label>
              <Input
                id="item-recurrence-interval"
                inputMode="numeric"
                value={form.recurrenceInterval}
                onChange={(event) => update('recurrenceInterval', event.target.value)}
                aria-invalid={errors.recurrenceInterval ? true : undefined}
              />
              {errors.recurrenceInterval ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.recurrenceInterval}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {showInterval ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="item-anchor-mode">Advance from</Label>
                <select
                  id="item-anchor-mode"
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={form.anchorMode}
                  onChange={(event) =>
                    update('anchorMode', event.target.value as FormState['anchorMode'])
                  }
                >
                  <option value="schedule">The due date</option>
                  <option value="completion">The completion date</option>
                </select>
              </div>

              {showAnchorDay ? (
                <div className="grid gap-2">
                  <Label htmlFor="item-anchor-day">Day of month</Label>
                  <Input
                    id="item-anchor-day"
                    inputMode="numeric"
                    value={form.anchorDay}
                    onChange={(event) => update('anchorDay', event.target.value)}
                    placeholder="Defaults to the due date's day"
                    aria-invalid={errors.anchorDay ? true : undefined}
                  />
                  {errors.anchorDay ? (
                    <p className="text-sm text-destructive" role="alert">
                      {errors.anchorDay}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="item-end-date">End date</Label>
                <Input
                  id="item-end-date"
                  type="date"
                  value={form.endDate}
                  onChange={(event) => update('endDate', event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="item-remaining-count">
                  Occurrences remaining, including this one
                </Label>
                <Input
                  id="item-remaining-count"
                  inputMode="numeric"
                  value={form.remainingCount}
                  onChange={(event) => update('remainingCount', event.target.value)}
                  placeholder="Leave blank to repeat indefinitely"
                  aria-invalid={errors.remainingCount ? true : undefined}
                />
                {errors.remainingCount ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.remainingCount}
                  </p>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </fieldset>

      {errors.form ? (
        <p className="text-sm text-destructive" role="alert">
          {errors.form}
        </p>
      ) : null}
      {serverError ? (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
