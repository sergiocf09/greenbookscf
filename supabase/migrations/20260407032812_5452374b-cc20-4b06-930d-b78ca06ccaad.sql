CREATE OR REPLACE FUNCTION public.validate_subscription_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.subscription_tier NOT IN ('free', 'pro') THEN
    RAISE EXCEPTION 'subscription_tier must be free or pro';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_subscription_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.plan NOT IN ('semestral', 'anual') THEN
    RAISE EXCEPTION 'plan must be semestral or anual';
  END IF;
  RETURN NEW;
END;
$$;