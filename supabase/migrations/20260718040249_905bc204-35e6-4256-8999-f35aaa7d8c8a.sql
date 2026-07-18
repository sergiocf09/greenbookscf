CREATE OR REPLACE FUNCTION public.enqueue_round_close_emails(p_round_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot       jsonb;
  v_course_name    text;
  v_round_date     text;
  v_tee_color      text;
  v_course_par     int;
  v_players        jsonb;
  v_scores         jsonb;
  v_balances       jsonb;
  v_player         jsonb;
  v_balance        jsonb;
  v_profile_id     uuid;
  v_email          text;
  v_display_name   text;
  v_new_handicap   numeric;
  v_old_handicap   numeric;
  v_gross          int;
  v_net            int;
  v_total_net      numeric;
  v_front_scores   text[];
  v_back_scores    text[];
  v_front_pars     text[];
  v_back_pars      text[];
  v_front_gross    int;
  v_back_gross     int;
  v_front_par      int;
  v_back_par       int;
  v_hole_score     jsonb;
  v_vs_rows        text;
  v_vs_entry       jsonb;
  v_vs_amount      numeric;
  v_vs_name        text;
  v_standings_rows text;
  v_pos            int;
  v_sorted_balance jsonb[];
  v_sb             jsonb;
  v_player_id      text;
  v_html           text;
  v_subject        text;
  v_date_formatted text;
  v_tee_label      text;
  v_handicap_arrow text;
  v_handicap_color text;
  v_balance_color  text;
  v_balance_sign   text;
  v_strokes        int;
  v_par_val        int;
  v_cell_color     text;
  v_front_out      text;
  v_back_in        text;
  i                int;
BEGIN
  SELECT rs.snapshot_json INTO v_snapshot
  FROM public.round_snapshots rs
  WHERE rs.round_id = p_round_id;
  IF v_snapshot IS NULL THEN RETURN; END IF;

  v_course_name  := COALESCE(v_snapshot->>'courseName', 'Campo');
  v_round_date   := COALESCE(v_snapshot->>'date', '');
  v_tee_color    := COALESCE(v_snapshot->>'teeColor', 'blanco');
  v_course_par   := COALESCE((v_snapshot->>'coursePar')::int, 72);
  v_players      := COALESCE(v_snapshot->'players', '[]'::jsonb);
  v_scores       := COALESCE(v_snapshot->'scores', '{}'::jsonb);
  v_balances     := COALESCE(v_snapshot->'balances', '[]'::jsonb);

  v_tee_label := CASE lower(v_tee_color)
    WHEN 'blue'   THEN 'Azules'
    WHEN 'white'  THEN 'Blancas'
    WHEN 'red'    THEN 'Rojas'
    WHEN 'yellow' THEN 'Amarillas'
    WHEN 'gold'   THEN 'Doradas'
    ELSE initcap(v_tee_color)
  END;

  BEGIN
    v_date_formatted := to_char(v_round_date::date, 'DD "de" Month YYYY', 'es_419');
  EXCEPTION WHEN OTHERS THEN
    v_date_formatted := v_round_date;
  END;

  SELECT array_agg(b ORDER BY (b->>'totalGross')::int ASC)
  INTO v_sorted_balance
  FROM jsonb_array_elements(v_balances) b;

  FOR v_player IN SELECT value FROM jsonb_array_elements(v_players)
  LOOP
    v_player_id  := v_player->>'id';
    v_profile_id := NULLIF(v_player->>'profileId', '')::uuid;
    IF v_profile_id IS NULL THEN CONTINUE; END IF;

    SELECT u.email, p.display_name
    INTO v_email, v_display_name
    FROM auth.users u
    JOIN public.profiles p ON p.user_id = u.id
    WHERE p.id = v_profile_id;

    IF v_email IS NULL THEN CONTINUE; END IF;

    v_display_name := COALESCE(v_display_name, v_player->>'name', 'Golfista');

    SELECT b INTO v_balance
    FROM jsonb_array_elements(v_balances) b
    WHERE b->>'playerId' = v_player_id
    LIMIT 1;

    v_gross     := COALESCE((v_balance->>'totalGross')::int, 0);
    v_total_net := COALESCE((v_balance->>'totalNet')::numeric, 0);
    v_old_handicap := COALESCE((v_player->>'handicap')::numeric, 0);

    SELECT hh.handicap INTO v_new_handicap
    FROM public.handicap_history hh
    WHERE hh.profile_id = v_profile_id
      AND hh.round_id = p_round_id
    ORDER BY hh.recorded_at DESC
    LIMIT 1;
    v_new_handicap := COALESCE(v_new_handicap, v_old_handicap);

    v_net := v_gross - v_old_handicap::int;

    IF v_new_handicap < v_old_handicap THEN
      v_handicap_arrow := ' ↓'; v_handicap_color := '#22c55e';
    ELSIF v_new_handicap > v_old_handicap THEN
      v_handicap_arrow := ' ↑'; v_handicap_color := '#ef4444';
    ELSE
      v_handicap_arrow := ''; v_handicap_color := '#94a3b8';
    END IF;

    IF v_total_net > 0 THEN
      v_balance_color := '#22c55e'; v_balance_sign := '+';
    ELSIF v_total_net < 0 THEN
      v_balance_color := '#ef4444'; v_balance_sign := '-';
    ELSE
      v_balance_color := '#94a3b8'; v_balance_sign := '';
    END IF;

    v_front_scores := ARRAY[]::text[];
    v_back_scores  := ARRAY[]::text[];
    v_front_pars   := ARRAY[]::text[];
    v_back_pars    := ARRAY[]::text[];
    v_front_gross  := 0; v_back_gross := 0;
    v_front_par    := 0; v_back_par   := 0;

    FOR i IN 1..18 LOOP
      SELECT hs INTO v_hole_score
      FROM jsonb_array_elements(v_scores->v_player_id) hs
      WHERE (hs->>'holeNumber')::int = i
      LIMIT 1;
      v_strokes := COALESCE((v_hole_score->>'strokes')::int, 0);

      SELECT ch.par INTO v_par_val
      FROM public.course_holes ch
      JOIN public.rounds r ON r.course_id = ch.course_id
      WHERE r.id = p_round_id AND ch.hole_number = i;
      v_par_val := COALESCE(v_par_val, 4);

      IF v_strokes = 0 THEN
        v_cell_color := '#1e293b';
      ELSIF v_strokes <= v_par_val - 2 THEN
        v_cell_color := '#eab308';
      ELSIF v_strokes = v_par_val - 1 THEN
        v_cell_color := '#22c55e';
      ELSIF v_strokes = v_par_val THEN
        v_cell_color := '#1e293b';
      ELSIF v_strokes = v_par_val + 1 THEN
        v_cell_color := '#f97316';
      ELSE
        v_cell_color := '#ef4444';
      END IF;

      IF i <= 9 THEN
        v_front_scores := array_append(v_front_scores,
          format('<td style="background:%s;color:#fff;text-align:center;padding:4px 2px;font-size:12px;font-weight:600;border:1px solid #334155;width:24px;">%s</td>',
            v_cell_color, CASE WHEN v_strokes = 0 THEN '-' ELSE v_strokes::text END));
        v_front_pars := array_append(v_front_pars,
          format('<td style="text-align:center;padding:4px 2px;font-size:11px;color:#94a3b8;border:1px solid #334155;width:24px;">%s</td>', v_par_val));
        v_front_gross := v_front_gross + v_strokes;
        v_front_par   := v_front_par + v_par_val;
      ELSE
        v_back_scores := array_append(v_back_scores,
          format('<td style="background:%s;color:#fff;text-align:center;padding:4px 2px;font-size:12px;font-weight:600;border:1px solid #334155;width:24px;">%s</td>',
            v_cell_color, CASE WHEN v_strokes = 0 THEN '-' ELSE v_strokes::text END));
        v_back_pars := array_append(v_back_pars,
          format('<td style="text-align:center;padding:4px 2px;font-size:11px;color:#94a3b8;border:1px solid #334155;width:24px;">%s</td>', v_par_val));
        v_back_gross := v_back_gross + v_strokes;
        v_back_par   := v_back_par + v_par_val;
      END IF;
    END LOOP;

    v_front_out := format('<td style="background:#0f172a;color:#f59e0b;text-align:center;padding:4px 2px;font-size:12px;font-weight:700;border:1px solid #334155;width:28px;">%s</td>', v_front_gross);
    v_back_in   := format('<td style="background:#0f172a;color:#f59e0b;text-align:center;padding:4px 2px;font-size:12px;font-weight:700;border:1px solid #334155;width:28px;">%s</td>', v_back_gross);

    v_standings_rows := '';
    v_pos := 1;
    FOREACH v_sb IN ARRAY v_sorted_balance LOOP
      DECLARE
        v_sb_id   text := v_sb->>'playerId';
        v_sb_name text := v_sb->>'playerName';
        v_sb_gross int := COALESCE((v_sb->>'totalGross')::int, 0);
        v_is_me   bool := v_sb_id = v_player_id;
        v_medal   text;
        v_row_bg  text;
        v_row_fw  text;
      BEGIN
        v_medal := CASE v_pos WHEN 1 THEN '🥇' WHEN 2 THEN '🥈' WHEN 3 THEN '🥉' ELSE v_pos::text || '°' END;
        v_row_bg := CASE WHEN v_is_me THEN '#1e3a5f' ELSE '#1e293b' END;
        v_row_fw := CASE WHEN v_is_me THEN '700' ELSE '400' END;
        v_standings_rows := v_standings_rows || format(
          '<tr style="background:%s;"><td style="padding:8px 10px;color:#f8fafc;font-weight:%s;font-size:13px;">%s %s%s</td><td style="padding:8px 10px;color:#94a3b8;font-size:13px;text-align:right;">%s</td></tr>',
          v_row_bg, v_row_fw, v_medal, v_sb_name,
          CASE WHEN v_is_me THEN ' <span style="color:#38bdf8;font-size:11px;">(tú)</span>' ELSE '' END,
          v_sb_gross
        );
        v_pos := v_pos + 1;
      END;
    END LOOP;

    v_vs_rows := '';
    IF v_balance->'vsBalances' IS NOT NULL THEN
      FOR v_vs_entry IN SELECT value FROM jsonb_array_elements(v_balance->'vsBalances')
      LOOP
        v_vs_amount := COALESCE((v_vs_entry->>'netAmount')::numeric, 0);
        IF v_vs_amount = 0 THEN CONTINUE; END IF;
        v_vs_name := COALESCE(v_vs_entry->>'rivalName', 'Rival');
        DECLARE
          v_color  text := CASE WHEN v_vs_amount > 0 THEN '#22c55e' ELSE '#ef4444' END;
          v_icon   text := CASE WHEN v_vs_amount > 0 THEN '✓' ELSE '✗' END;
          v_label  text := CASE WHEN v_vs_amount > 0 THEN 'Ganaste' ELSE 'Perdiste' END;
          v_fmt    text := CASE WHEN v_vs_amount > 0
                            THEN '+$' || to_char(v_vs_amount, 'FM999,990.00')
                            ELSE '-$' || to_char(abs(v_vs_amount), 'FM999,990.00') END;
        BEGIN
          v_vs_rows := v_vs_rows || format(
            '<tr><td style="padding:7px 10px;color:#cbd5e1;font-size:13px;">vs %s</td><td style="padding:7px 10px;text-align:right;"><span style="color:%s;font-weight:700;font-size:13px;">%s</span> <span style="color:%s;font-size:11px;margin-left:4px;">%s %s</span></td></tr>',
            v_vs_name, v_color, v_fmt, v_color, v_icon, v_label
          );
        END;
      END LOOP;
    END IF;

    v_subject := format('Tu ronda en %s · %s', v_course_name, v_date_formatted);

    v_html := format($HTML$<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Resumen de Ronda · GreenBook</title></head>
<body style="margin:0;padding:0;background:#0a0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%%" cellpadding="0" cellspacing="0" style="background:#0a0f1a;padding:20px 0;"><tr><td align="center">
<table width="100%%" style="max-width:480px;margin:0 auto;" cellpadding="0" cellspacing="0">
<tr><td style="padding:0;border-radius:16px 16px 0 0;overflow:hidden;text-align:center;background:#0a2d18;">
<img src="https://golfgreenbookscf.com/email-header.png" alt="GreenBook" width="480" style="display:block;width:100%%;max-width:480px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr>
<tr><td style="background:#0a2d18;padding:0 24px 20px;text-align:center;">
<div style="font-size:22px;font-weight:800;color:#f8fafc;margin-bottom:4px;">Resumen de Ronda</div>
<div style="font-size:13px;color:#86efac;">%s</div>
<div style="font-size:12px;color:#4ade80;margin-top:4px;">%s · Tees %s</div>
</td></tr>
<tr><td style="background:#0f172a;padding:20px 24px 16px;">
<div style="font-size:10px;font-weight:700;letter-spacing:2px;color:#64748b;text-transform:uppercase;margin-bottom:12px;">Tu Resultado</div>
<table width="100%%" cellpadding="0" cellspacing="0"><tr>
<td style="text-align:center;padding:0 8px;"><div style="font-size:11px;color:#64748b;margin-bottom:4px;">GROSS</div><div style="font-size:36px;font-weight:800;color:#f8fafc;line-height:1;">%s</div></td>
<td style="text-align:center;padding:0 8px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;"><div style="font-size:11px;color:#64748b;margin-bottom:4px;">NETO</div><div style="font-size:36px;font-weight:800;color:#38bdf8;line-height:1;">%s</div></td>
<td style="text-align:center;padding:0 8px;"><div style="font-size:11px;color:#64748b;margin-bottom:4px;">Hcp Index</div><div style="font-size:36px;font-weight:800;line-height:1;color:%s;">%s<span style="font-size:16px;">%s</span></div></td>
</tr></table></td></tr>
<tr><td style="background:#0f172a;padding:4px 24px 16px;">
<div style="font-size:10px;font-weight:700;letter-spacing:2px;color:#64748b;text-transform:uppercase;margin-bottom:10px;">Scorecard</div>
<div style="font-size:10px;color:#64748b;margin-bottom:4px;letter-spacing:1px;">FRONT 9</div>
<div style="overflow-x:auto;"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:100%%;">
<tr><td style="padding:4px 4px;font-size:10px;color:#64748b;white-space:nowrap;border:1px solid #334155;width:28px;">Hoyo</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">1</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">2</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">3</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">4</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">5</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">6</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">7</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">8</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">9</td>
<td style="padding:4px 2px;font-size:10px;color:#f59e0b;font-weight:700;text-align:center;border:1px solid #334155;width:28px;">OUT</td></tr>
<tr><td style="padding:4px 4px;font-size:11px;color:#94a3b8;border:1px solid #334155;">Par</td>%s<td style="text-align:center;padding:4px 2px;font-size:11px;color:#f59e0b;font-weight:700;border:1px solid #334155;">%s</td></tr>
<tr><td style="padding:4px 4px;font-size:11px;color:#f8fafc;font-weight:600;border:1px solid #334155;">Score</td>%s%s</tr>
</table></div>
<div style="font-size:10px;color:#64748b;margin-top:10px;margin-bottom:4px;letter-spacing:1px;">BACK 9</div>
<div style="overflow-x:auto;"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:100%%;">
<tr><td style="padding:4px 4px;font-size:10px;color:#64748b;white-space:nowrap;border:1px solid #334155;width:28px;">Hoyo</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">10</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">11</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">12</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">13</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">14</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">15</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">16</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">17</td>
<td style="padding:4px 2px;font-size:10px;color:#64748b;text-align:center;border:1px solid #334155;width:24px;">18</td>
<td style="padding:4px 2px;font-size:10px;color:#f59e0b;font-weight:700;text-align:center;border:1px solid #334155;width:28px;">IN</td></tr>
<tr><td style="padding:4px 4px;font-size:11px;color:#94a3b8;border:1px solid #334155;">Par</td>%s<td style="text-align:center;padding:4px 2px;font-size:11px;color:#f59e0b;font-weight:700;border:1px solid #334155;">%s</td></tr>
<tr><td style="padding:4px 4px;font-size:11px;color:#f8fafc;font-weight:600;border:1px solid #334155;">Score</td>%s%s</tr>
</table></div>
<table width="100%%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#0a2d18;border-radius:8px;"><tr>
<td style="padding:10px 12px;font-size:12px;color:#4ade80;font-weight:700;letter-spacing:1px;">TOTAL</td>
<td style="padding:10px 12px;text-align:right;"><span style="font-size:18px;font-weight:800;color:#f8fafc;">%s</span><span style="font-size:12px;color:#64748b;margin-left:6px;">/ %s par</span></td>
</tr></table></td></tr>
<tr><td style="background:#0f172a;padding:4px 24px 16px;border-top:1px solid #1e293b;">
<div style="font-size:10px;font-weight:700;letter-spacing:2px;color:#64748b;text-transform:uppercase;margin-bottom:10px;">Posición en el Grupo</div>
<table width="100%%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;">%s</table>
</td></tr>
%s
<tr><td style="background:#0f172a;padding:4px 24px 20px;">
<table width="100%%" cellpadding="0" cellspacing="0" style="background:#0a2d18;border-radius:10px;"><tr>
<td style="padding:14px 16px;font-size:13px;color:#4ade80;font-weight:700;">Balance del día</td>
<td style="padding:14px 16px;text-align:right;"><span style="font-size:22px;font-weight:800;color:%s;">%s$%s</span></td>
</tr></table></td></tr>
<tr><td style="background:#061a0e;padding:20px 24px;border-radius:0 0 16px 16px;text-align:center;">
<a href="https://golfgreenbookscf.com" style="display:inline-block;background:#166534;color:#f8fafc;font-size:13px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;margin-bottom:16px;">Ver ronda completa →</a>
<div style="font-size:11px;color:#4ade80;"><a href="https://golfgreenbookscf.com" style="color:#4ade80;text-decoration:none;">golfgreenbookscf.com</a></div>
<div style="font-size:10px;color:#1f2937;margin-top:4px;">© 2026 GreenBook. Todos los derechos reservados.</div>
</td></tr></table></td></tr></table></body></html>$HTML$,
      v_course_name,
      v_date_formatted,
      v_tee_label,
      v_gross,
      v_net,
      v_handicap_color, v_new_handicap, v_handicap_arrow,
      array_to_string(v_front_pars, ''),
      v_front_par,
      array_to_string(v_front_scores, ''),
      v_front_out,
      array_to_string(v_back_pars, ''),
      v_back_par,
      array_to_string(v_back_scores, ''),
      v_back_in,
      v_gross, v_course_par,
      v_standings_rows,
      CASE WHEN v_vs_rows <> '' THEN format(
        '<tr><td style="background:#0f172a;padding:4px 24px 16px;border-top:1px solid #1e293b;"><div style="font-size:10px;font-weight:700;letter-spacing:2px;color:#64748b;text-transform:uppercase;margin-bottom:10px;">Apuestas del Día</div><table width="100%%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;background:#1e293b;">%s</table></td></tr>', v_vs_rows)
      ELSE '' END,
      v_balance_color,
      v_balance_sign,
      to_char(abs(v_total_net), 'FM999,990.00')
    );

    PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
      'to',               v_email,
      'subject',          v_subject,
      'html',             v_html,
      'label',            'round_close_summary',
      'idempotency_key',  p_round_id || '::' || v_profile_id::text
    ));
  END LOOP;
END;
$function$;