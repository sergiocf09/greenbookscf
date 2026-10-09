ALTER TABLE public.wolf_config ADD COLUMN hole_value numeric;
UPDATE public.wolf_config SET hole_value = amount_per_hole;
COMMENT ON COLUMN public.wolf_config.hole_value IS 'Wolf total hole value, divided by winner-loser pairs.';
COMMENT ON COLUMN public.wolf_config.amount_per_hole IS 'DEPRECATED: Wolf application uses hole_value; retained for deployed client compatibility.';
ALTER TABLE public.wolf_hole_state ADD COLUMN redemption_mode text CHECK (redemption_mode IN ('normal', 'all_in'));
ALTER TABLE public.wolf_hole_state ADD COLUMN all_in_amount numeric CHECK (all_in_amount >= 0);
ALTER TABLE public.wolf_hole_state ADD COLUMN effective_hole_value numeric;
UPDATE public.wolf_hole_state SET redemption_mode = 'normal' WHERE carryover_holes = -1;
COMMENT ON COLUMN public.wolf_hole_state.effective_amount IS 'DEPRECATED: cached legacy per-pair integer. Wolf computes per-pair value from effective_hole_value and teams.';