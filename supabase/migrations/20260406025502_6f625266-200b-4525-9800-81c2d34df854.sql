
-- Update get_money_ranking_balances to support custom date range
CREATE OR REPLACE FUNCTION public.get_money_ranking_balances(
  p_ranking_id uuid,
  p_period text DEFAULT 'all',
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  profile_id uuid,
  display_name text,
  initials text,
  avatar_color text,
  net_balance numeric,
  rounds_played bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_from timestamptz;
  v_date_to timestamptz;
BEGIN
  IF p_period = 'year' THEN
    v_date_from := date_trunc('year', now());
    v_date_to := now();
  ELSIF p_period = 'custom' AND p_date_from IS NOT NULL THEN
    v_date_from := p_date_from;
    v_date_to := coalesce(p_date_to, now());
  ELSE
    v_date_from := '1970-01-01'::timestamptz;
    v_date_to := now();
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT mrm.profile_id AS pid
    FROM public.money_ranking_members mrm
    WHERE mrm.ranking_id = p_ranking_id
  ),
  qualifying_rounds AS (
    SELECT lt.round_id
    FROM public.ledger_transactions lt
    WHERE lt.from_profile_id IN (SELECT pid FROM members)
      AND lt.to_profile_id IN (SELECT pid FROM members)
      AND lt.created_at >= v_date_from
      AND lt.created_at <= v_date_to
    GROUP BY lt.round_id
    HAVING count(DISTINCT lt.from_profile_id) + count(DISTINCT lt.to_profile_id) >= 2
  ),
  valid_transactions AS (
    SELECT lt.from_profile_id, lt.to_profile_id, lt.amount, lt.round_id
    FROM public.ledger_transactions lt
    WHERE lt.round_id IN (SELECT round_id FROM qualifying_rounds)
      AND lt.from_profile_id IN (SELECT pid FROM members)
      AND lt.to_profile_id IN (SELECT pid FROM members)
  ),
  member_balances AS (
    SELECT
      t.pid2 AS mb_profile_id,
      coalesce(sum(t.cobrado), 0) - coalesce(sum(t.pagado), 0) AS mb_net_balance,
      count(DISTINCT t.rid) AS mb_rounds_played
    FROM (
      SELECT vt.to_profile_id AS pid2, vt.amount AS cobrado, 0::numeric AS pagado, vt.round_id AS rid
      FROM valid_transactions vt
      UNION ALL
      SELECT vt.from_profile_id AS pid2, 0::numeric AS cobrado, vt.amount AS pagado, vt.round_id AS rid
      FROM valid_transactions vt
    ) t
    GROUP BY t.pid2
  )
  SELECT
    m.pid AS profile_id,
    p.display_name,
    p.initials,
    p.avatar_color,
    coalesce(mb.mb_net_balance, 0) AS net_balance,
    coalesce(mb.mb_rounds_played, 0)::bigint AS rounds_played
  FROM members m
  JOIN public.profiles p ON p.id = m.pid
  LEFT JOIN member_balances mb ON mb.mb_profile_id = m.pid
  ORDER BY coalesce(mb.mb_net_balance, 0) DESC;
END;
$$;

-- Update get_money_ranking_bilateral to support custom date range
CREATE OR REPLACE FUNCTION public.get_money_ranking_bilateral(
  p_ranking_id uuid,
  p_profile_id uuid,
  p_period text DEFAULT 'all',
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  rival_profile_id uuid,
  display_name text,
  initials text,
  avatar_color text,
  net_balance numeric,
  rounds_together bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_from timestamptz;
  v_date_to timestamptz;
BEGIN
  IF p_period = 'year' THEN
    v_date_from := date_trunc('year', now());
    v_date_to := now();
  ELSIF p_period = 'custom' AND p_date_from IS NOT NULL THEN
    v_date_from := p_date_from;
    v_date_to := coalesce(p_date_to, now());
  ELSE
    v_date_from := '1970-01-01'::timestamptz;
    v_date_to := now();
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT mrm.profile_id AS pid
    FROM public.money_ranking_members mrm
    WHERE mrm.ranking_id = p_ranking_id
  ),
  qualifying_rounds AS (
    SELECT lt.round_id
    FROM public.ledger_transactions lt
    WHERE lt.from_profile_id IN (SELECT pid FROM members)
      AND lt.to_profile_id IN (SELECT pid FROM members)
      AND lt.created_at >= v_date_from
      AND lt.created_at <= v_date_to
    GROUP BY lt.round_id
    HAVING count(DISTINCT lt.from_profile_id) + count(DISTINCT lt.to_profile_id) >= 2
  ),
  bilateral AS (
    SELECT
      CASE WHEN lt.from_profile_id = p_profile_id THEN lt.to_profile_id ELSE lt.from_profile_id END AS rival_id,
      CASE WHEN lt.from_profile_id = p_profile_id THEN -lt.amount ELSE lt.amount END AS net_amt,
      lt.round_id
    FROM public.ledger_transactions lt
    WHERE lt.round_id IN (SELECT round_id FROM qualifying_rounds)
      AND (lt.from_profile_id = p_profile_id OR lt.to_profile_id = p_profile_id)
      AND lt.from_profile_id IN (SELECT pid FROM members)
      AND lt.to_profile_id IN (SELECT pid FROM members)
  )
  SELECT
    b.rival_id AS rival_profile_id,
    p.display_name,
    p.initials,
    p.avatar_color,
    sum(b.net_amt) AS net_balance,
    count(DISTINCT b.round_id) AS rounds_together
  FROM bilateral b
  JOIN public.profiles p ON p.id = b.rival_id
  GROUP BY b.rival_id, p.display_name, p.initials, p.avatar_color
  ORDER BY sum(b.net_amt) DESC;
END;
$$;
