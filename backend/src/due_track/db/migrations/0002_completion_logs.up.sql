CREATE TABLE completion_logs (
    id                            INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id                       INTEGER
                                  REFERENCES due_items (id) ON DELETE SET NULL,
    scheduled_due_at_utc          TEXT    NOT NULL,
    completed_at_utc              TEXT    NOT NULL,
    previous_state_snapshot_json  TEXT    NOT NULL
                                          CHECK (json_valid(previous_state_snapshot_json))
);

CREATE INDEX idx_completion_logs_completed
    ON completion_logs (completed_at_utc DESC);

CREATE INDEX idx_completion_logs_item_completed
    ON completion_logs (item_id, completed_at_utc DESC);
