CREATE TABLE due_items (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    title                     TEXT    NOT NULL
                                      CHECK (length(trim(title)) BETWEEN 1 AND 200),
    notes                     TEXT    NOT NULL DEFAULT ''
                                      CHECK (length(notes) <= 10000),
    due_at_utc                TEXT    NOT NULL,
    is_date_only              INTEGER NOT NULL DEFAULT 0
                                      CHECK (is_date_only IN (0, 1)),
    category                  TEXT
                                      CHECK (category IS NULL
                                             OR length(trim(category)) BETWEEN 1 AND 50),
    priority                  TEXT    NOT NULL DEFAULT 'medium'
                                      CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    amount_cents              INTEGER
                                      CHECK (amount_cents IS NULL OR amount_cents >= 0),
    recurrence_freq           TEXT    NOT NULL DEFAULT 'none'
                                      CHECK (recurrence_freq IN (
                                          'none',
                                          'daily', 'weekly', 'monthly', 'yearly',
                                          'custom_days', 'custom_weeks',
                                          'custom_months', 'custom_years'
                                      )),
    recurrence_interval       INTEGER NOT NULL DEFAULT 1
                                      CHECK (recurrence_interval >= 1),
    recurrence_anchor_mode    TEXT    NOT NULL DEFAULT 'schedule'
                                      CHECK (recurrence_anchor_mode IN ('schedule', 'completion')),
    recurrence_anchor_day     INTEGER
                                      CHECK (recurrence_anchor_day IS NULL
                                             OR recurrence_anchor_day BETWEEN 1 AND 31),
    recurrence_end_at_utc     TEXT
                                      CHECK (recurrence_end_at_utc IS NULL
                                             OR recurrence_end_at_utc GLOB
                                                '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'),
    recurrence_remaining_count INTEGER
                                      CHECK (recurrence_remaining_count IS NULL
                                             OR recurrence_remaining_count >= 0),
    status                    TEXT    NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active', 'completed', 'deleted')),
    created_at_utc            TEXT    NOT NULL,
    updated_at_utc            TEXT    NOT NULL,

    CHECK (
        recurrence_freq <> 'none'
        OR (
            recurrence_interval = 1
            AND recurrence_anchor_mode = 'schedule'
            AND recurrence_anchor_day IS NULL
            AND recurrence_end_at_utc IS NULL
            AND recurrence_remaining_count IS NULL
        )
    ),

    CHECK (
        recurrence_freq NOT IN ('daily', 'weekly', 'monthly', 'yearly')
        OR recurrence_interval = 1
    ),

    CHECK (
        recurrence_freq NOT IN ('daily', 'weekly', 'custom_days', 'custom_weeks')
        OR recurrence_anchor_day IS NULL
    ),
    CHECK (
        recurrence_anchor_mode <> 'completion'
        OR recurrence_anchor_day IS NULL
    ),
    CHECK (
        recurrence_freq NOT IN ('monthly', 'yearly', 'custom_months', 'custom_years')
        OR recurrence_anchor_mode <> 'schedule'
        OR recurrence_anchor_day IS NOT NULL
    ),

    CHECK (recurrence_end_at_utc IS NULL OR recurrence_remaining_count IS NULL),

    CHECK (status <> 'active' OR recurrence_remaining_count IS NULL
           OR recurrence_remaining_count >= 1)
);

CREATE INDEX idx_due_items_active_due
    ON due_items (due_at_utc)
    WHERE status = 'active';

CREATE INDEX idx_due_items_category
    ON due_items (category)
    WHERE status = 'active';

CREATE INDEX idx_due_items_priority
    ON due_items (priority)
    WHERE status = 'active';

CREATE INDEX idx_due_items_recurrence
    ON due_items (recurrence_freq)
    WHERE status = 'active';
