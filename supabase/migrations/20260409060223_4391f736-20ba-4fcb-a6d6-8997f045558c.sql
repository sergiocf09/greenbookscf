ALTER TABLE sixes_config
  ADD COLUMN IF NOT EXISTS use_per_set_amounts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS set1_amount numeric,
  ADD COLUMN IF NOT EXISTS set2_amount numeric,
  ADD COLUMN IF NOT EXISTS set3_amount numeric;

ALTER TABLE vegas_config
  ADD COLUMN IF NOT EXISTS use_segment_amounts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS front_amount numeric,
  ADD COLUMN IF NOT EXISTS back_amount  numeric,
  ADD COLUMN IF NOT EXISTS set1_amount  numeric,
  ADD COLUMN IF NOT EXISTS set2_amount  numeric,
  ADD COLUMN IF NOT EXISTS set3_amount  numeric;