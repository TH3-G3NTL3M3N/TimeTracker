CREATE TABLE IF NOT EXISTS app_state (
  id integer PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);
