-- Columnas de suscripción en profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false;

-- Add validation trigger instead of CHECK constraint for subscription_tier
CREATE OR REPLACE FUNCTION public.validate_subscription_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.subscription_tier NOT IN ('free', 'pro') THEN
    RAISE EXCEPTION 'subscription_tier must be free or pro';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_subscription_tier
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_subscription_tier();

-- Marcar como Fundador a usuarios con 3+ rondas cerradas como organizador
UPDATE public.profiles SET is_founder = true
WHERE id IN (
  SELECT organizer_id FROM rounds
  WHERE status = 'completed'
  GROUP BY organizer_id
  HAVING COUNT(*) >= 3
);

-- Tabla de registro de suscripciones (NO referencing auth.users)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan text NOT NULL,
  stripe_session_id text,
  amount_paid numeric(10,2),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add validation trigger for plan
CREATE OR REPLACE FUNCTION public.validate_subscription_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.plan NOT IN ('semestral', 'anual') THEN
    RAISE EXCEPTION 'plan must be semestral or anual';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_subscription_plan
  BEFORE INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_subscription_plan();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscriptions"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (profile_id = get_my_profile_id());

CREATE POLICY "No direct inserts to subscriptions"
  ON public.subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Función: ¿puede crear ronda como organizador?
CREATE OR REPLACE FUNCTION public.can_create_round_as_organizer()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_tier text;
  v_expires_at timestamptz;
  v_count int;
  v_paywall_date timestamptz := '2026-05-01T06:00:00Z';
BEGIN
  IF now() < v_paywall_date THEN RETURN true; END IF;

  SELECT id, subscription_tier, subscription_expires_at
    INTO v_profile_id, v_tier, v_expires_at
    FROM profiles WHERE user_id = auth.uid();

  IF v_profile_id IS NULL THEN RETURN false; END IF;

  IF v_tier = 'pro' AND (v_expires_at IS NULL OR v_expires_at > now()) THEN
    RETURN true;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM rounds
    WHERE organizer_id = v_profile_id
      AND status = 'completed';

  RETURN v_count < 12;
END;
$$;
GRANT EXECUTE ON FUNCTION public.can_create_round_as_organizer() TO authenticated;

-- Función: ¿tiene acceso completo a historial?
CREATE OR REPLACE FUNCTION public.can_access_full_history()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_tier text;
  v_expires_at timestamptz;
  v_count int;
  v_paywall_date timestamptz := '2026-05-01T06:00:00Z';
BEGIN
  IF now() < v_paywall_date THEN RETURN true; END IF;

  SELECT id, subscription_tier, subscription_expires_at
    INTO v_profile_id, v_tier, v_expires_at
    FROM profiles WHERE user_id = auth.uid();

  IF v_profile_id IS NULL THEN RETURN false; END IF;

  IF v_tier = 'pro' AND (v_expires_at IS NULL OR v_expires_at > now()) THEN
    RETURN true;
  END IF;

  SELECT COUNT(DISTINCT r.id) INTO v_count
    FROM rounds r
    INNER JOIN round_players rp ON rp.round_id = r.id
    WHERE rp.profile_id = v_profile_id
      AND r.status = 'completed';

  RETURN v_count < 4;
END;
$$;
GRANT EXECUTE ON FUNCTION public.can_access_full_history() TO authenticated;

-- Conteo de rondas como organizador
CREATE OR REPLACE FUNCTION public.get_organizer_rounds_closed_count()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_count int;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN 0; END IF;
  SELECT COUNT(*) INTO v_count FROM rounds
    WHERE organizer_id = v_profile_id AND status = 'completed';
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_organizer_rounds_closed_count() TO authenticated;

-- Conteo de rondas participadas
CREATE OR REPLACE FUNCTION public.get_participated_rounds_closed_count()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_count int;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN 0; END IF;
  SELECT COUNT(DISTINCT r.id) INTO v_count
    FROM rounds r
    INNER JOIN round_players rp ON rp.round_id = r.id
    WHERE rp.profile_id = v_profile_id AND r.status = 'completed';
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_participated_rounds_closed_count() TO authenticated;