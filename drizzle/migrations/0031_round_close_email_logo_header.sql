DO $mig$
DECLARE
  d text;
  n text;
BEGIN
  d := pg_get_functiondef('public.enqueue_round_close_emails'::regproc);
  n := replace(d,
$o$<tr><td style="background:#0a2d18;padding:28px 24px 8px;text-align:center;border-radius:16px 16px 0 0;">
<div style="font-family:Georgia,serif;font-size:32px;font-style:italic;font-weight:500;color:#d9af4f;letter-spacing:1px;">GreenBook</div>
</td></tr>$o$,
$n$<tr><td class="gb-head" style="background:#0a2d18;padding:28px 24px 18px;border-radius:16px 16px 0 0;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0"><tr><td class="gb-logo-cell" width="94" valign="middle"><a href="https://golfgreenbookscf.com/" style="text-decoration:none"><img src="https://golfgreenbookscf.com/assets/greenbook-icon-circle-dark-BFJgv0wp.png" width="82" height="82" alt="GreenBook" class="gb-logo" style="display:block;border:0;width:82px;height:82px;border-radius:50%%"></a></td><td align="center" valign="middle" style="text-align:center"><div class="gb-f29" style="font-family:Georgia,serif;font-size:29px;line-height:1.1;font-style:italic;color:#d5b65d;">GreenBook</div><div class="gb-f15" style="font-family:Georgia,serif;font-size:15px;font-style:italic;color:#d5b65d;margin-top:3px;">by SCF</div></td></tr></table>
<div style="border-top:1px solid #2a5a3f;margin-top:18px;font-size:0;line-height:0;">&nbsp;</div>
</td></tr>$n$);
  n := replace(n,
$o$<title>Resumen de Ronda · GreenBook</title></head>$o$,
$n$<title>Resumen de Ronda · GreenBook</title><style>@media(max-width:480px){.gb-logo{width:66px!important;height:66px!important}.gb-logo-cell{width:76px!important}.gb-f29{font-size:23px!important}.gb-f15{font-size:13px!important}}</style></head>$n$);
  IF n = d OR position('gb-logo-cell' in n) = 0 OR position('.gb-f29{' in n) = 0 THEN
    RAISE EXCEPTION 'Round close email header not found; no change applied';
  END IF;
  EXECUTE n;
END
$mig$;