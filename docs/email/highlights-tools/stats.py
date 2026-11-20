import subprocess, json, sys
def q(sql):
    out=subprocess.run(['psql','-At','-c',f"select coalesce(json_agg(t),'[]') from ({sql}) t"],capture_output=True,text=True)
    if out.returncode: print(out.stderr); sys.exit(1)
    return json.loads(out.stdout)
def stats(pid):
    base=f"""with rp as (
 select rp.id rpid, r.id rid, r.date, r.course_id, gc.name course, coalesce((r.bet_config->>'roundHoles')::int,18) rh, coalesce(r.starting_hole,1) sh
 from round_players rp join rounds r on r.id=rp.round_id join golf_courses gc on gc.id=r.course_id
 where rp.profile_id='{pid}' and r.status='completed' and r.date between '2026-01-01' and '2026-09-30'
 and coalesce(r.is_incomplete,false)=false and coalesce(rp.is_cross_only,false)=false),
h as (select rp.*, hs.hole_number, hs.strokes, hs.putts, ch.par from rp join hole_scores hs on hs.round_player_id=rp.rpid
 join course_holes ch on ch.course_id=rp.course_id and ch.hole_number=hs.hole_number where hs.strokes is not null
 and (rh<>9 or (case when sh=10 then hs.hole_number between 10 and 18 else hs.hole_number between 1 and 9 end))),
t as (select rid, date, course, course_id, rh, count(*) n, sum(strokes) g, sum(putts) p, count(*) filter (where putts>0) np, sum(par) cpar from h group by 1,2,3,4,5),
f as (select * from t where rh<>9 and n>=18)"""
    s={}
    s['tot']=q(base+""" select (select count(*) from rp) rounds, (select count(*) from rp where rh=9) nine, (select count(*) from f) full18,
 (select count(distinct course_id) from rp) courses,
 (select count(*) from f where g<80) u80,(select count(*) from f where g<90) u90,(select count(*) from f where g<100) u100,
 (select count(*) from h where strokes=par-1) birdies,(select count(*) from h where strokes<=par-2 and strokes>1) eagles,(select count(*) from h where strokes=1) hio,
 (select count(*) from h where strokes=par) pars,
 (select round(avg(p),1) from f where np>0) putts,(select count(*) from f where np>0) putts_n""")[0]
    s['best']=q(base+" select date, course, g, cpar from f where g=(select min(g) from f) order by date")
    s['first']=q(base+" select date, g from f order by date limit 1")
    s['top']=q(base+" select course, count(*) n from rp group by course order by n desc limit 1")
    s['money']=q(f"""with rs as (select distinct on (s.round_id) s.round_id, s.snapshot_json j from round_snapshots s join rounds r on r.id=s.round_id
 where r.status='completed' and r.date between '2026-01-01' and '2026-09-30' and coalesce(r.is_incomplete,false)=false
 order by s.round_id, s.snapshot_version desc, s.created_at desc),
mine as (select rs.round_id, b from rs, jsonb_array_elements(rs.j->'balances') b where b->>'playerId'='{pid}'),
v as (select round_id, x->>'rivalId' rid, trim(x->>'rivalName') rname, (x->>'netAmount')::numeric amt from mine, jsonb_array_elements(b->'vsBalances') x),
agg as (select coalesce(p.id::text,'g:'||lower(v.rname)) k, sum(amt) net from v left join profiles p on p.id::text=v.rid group by 1)
select (select count(*) filter (where (b->>'totalNet')::numeric>0) from mine) wins,(select count(*) filter (where (b->>'totalNet')::numeric<0) from mine) losses,
 (select coalesce(sum((b->>'totalNet')::numeric),0) from mine) net,
 count(*) rivals, count(*) filter (where net>0) pos_n, coalesce(sum(net) filter (where net>0),0) pos_sum,
 count(*) filter (where net<0) neg_n, coalesce(sum(net) filter (where net<0),0) neg_sum from agg""")[0]
    return s
if __name__=='__main__':
    print(json.dumps(stats(sys.argv[1]),indent=1,default=str))
