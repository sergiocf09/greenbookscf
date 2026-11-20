import json, re, html as H
T=open('/dev-server/docs/email/highlights-ene-sep-2026.html').read()
NEG=open('/dev-server/docs/email/highlights-ejemplo-saldo-negativo.html').read()
HEAD=T[:T.index('<!-- MEJOR RONDA -->')]
CLOSE=T[T.index('<!-- CIERRE -->'):]
MES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
ACC={'Raul':'Raúl','Jose':'José','German':'Germán','Angel':'Ángel','Hector':'Héctor','Cesar':'César','Adrian':'Adrián','Ruben':'Rubén','Martin':'Martín','Ramon':'Ramón','Julian':'Julián','Andres':'Andrés','Oscar':'Óscar','Ivan':'Iván','Jesus':'Jesús'}
COMP={('Jose','Luis'),('Juan','Jose'),('Juan','Carlos'),('Jose','Miguel'),('Juan','Pablo'),('Luis','Pablo')}
def first_name(n):
    if re.search(r'[\d._@]',n) : return None
    t=n.split()
    if len(t)>=2 and (t[0],t[1]) in COMP: return ACC.get(t[0],t[0])+' '+ACC.get(t[1],t[1])
    return ACC.get(t[0],t[0])
def d(s,year=True):
    y,m,dd=map(int,s.split('-')); return f"{dd} de {MES[m-1]}"+(f" de {y}" if year else '')
def money(v,sign=True):
    v=round(v); s=f"${abs(v):,}"
    return ('+' if v>0 else ('−' if v<0 else ''))+s if sign else s
def frac(c,n):
    if n==0: return ''
    r=c/n
    if c==n: return 'Todas tus rondas de 18 hoyos'
    if c==1: return 'Una tarjeta para recordar'
    if r>=0.9: return '9 de cada 10 rondas de 18 hoyos'
    if r>0.75: return 'Más de 3 de cada 4 rondas de 18 hoyos'
    if r==0.75: return '3 de cada 4 rondas de 18 hoyos'
    if r>0.5: return 'Más de la mitad de tus rondas de 18 hoyos'
    if r==0.5: return 'La mitad de tus rondas de 18 hoyos'
    if r>0.25: return 'Más de 1 de cada 4 rondas de 18 hoyos'
    if r==0.25: return '1 de cada 4 rondas de 18 hoyos'
    return 'Tus mejores tarjetas del año'
def per_round(c,n):
    r=c/n if n else 0
    if r>=2: return 'Más de dos por ronda' if r>2 else 'Dos por ronda'
    if r>=1.75: return 'Casi dos por ronda'
    if r>1: return 'Más de uno por ronda'
    if r==1: return 'Uno por ronda'
    if r>=0.8: return 'Casi uno por ronda'
    if r>=0.5: return 'Uno cada dos rondas'
    return 'Hoyos para recordar'
def pars_round(c,n):
    r=c/n if n else 0
    if r>=1: k=int(r); return f'Más de {k} por ronda' if r>k else f'{k} por ronda'
    return 'Hoyos para recordar'
SM='<p class="f13 small" style="margin-top:5px;font-size:13px;line-height:1.6;color:#68766b">'
def cell(num,label,sub,first,n=2):
    w='100%' if n==1 else ('50%' if n==2 else '33%')
    st=f'padding-right:16px;vertical-align:top' if first else 'border-left:1px solid #d7dccf;padding-left:24px;vertical-align:top'
    if n==1: st='vertical-align:top'
    return f'<td width="{w}" style="{st}"><p class="f44 num" style="font-size:44px;font-weight:700;letter-spacing:-2px">{num}</p><p class="f15" style="font-size:15px;font-weight:bold;margin-top:5px">{label}</p>{SM}{sub}</p></td>'
def gcell(num,label,sub,first,n):
    w='100%' if n==1 else ('50%' if n==2 else '33%')
    if n==1: st='vertical-align:top'
    elif first: st='padding-right:16px;vertical-align:top'
    else: st=f'border-left:1px solid #406355;padding-left:{24 if n==2 else 16}px;vertical-align:top'
    if n==3 and not first: st+=';padding-right:8px'
    fs='54' if n<3 else '44'
    return f'<td width="{w}" style="{st}"><p class="f{fs} gold" style="font-family:Georgia,serif;font-size:{fs}px;line-height:1;color:#d5b65d;letter-spacing:-2px">{num}</p><p class="f15" style="font-size:15px;font-weight:bold;margin-top:8px;color:#faf9f3">{label}</p><p class="f13" style="font-size:13px;line-height:1.6;color:#b9cabd;margin-top:4px">{sub}</p></td>'
def build(s):
    t=s['tot']; m=s['money']; fn=first_name(s['name'])
    best=s['best']; b=best[0] if best else None
    nine=t['nine']; rounds=t['rounds']; full=t['full18']
    o=HEAD
    hi = f"{t['birdies']} birdies" if t['birdies'] else f"{t['pars']} pares"
    pre=(f"{fn}, " if fn else '')+f"{rounds} rondas, tu mejor ronda de {b['g']} y {hi}. Así va tu temporada." if b else f"{rounds} rondas. Así va tu temporada."
    if not fn: pre=pre[0].upper()+pre[1:]
    o=o.replace('{{first_name}}, 121 rondas, 32 bajo 80, 142 birdies y 81 rivales. Así va tu temporada.',pre)
    o=o.replace('Sergio, cada ronda dejó su huella.',(f"{fn}, cada ronda dejó su huella." if fn else 'Cada ronda dejó su huella.'))
    assert '{{' not in o and o.lower().count('cada ronda dejó su huella')==1 and '121 rondas, 32 bajo' not in o
    # MEJOR RONDA
    if b:
        courses={x['course'] for x in best}
        cline=b['course'] if len(courses)==1 else 'En '+str(len(courses))+' campos distintos'
        if len(courses)==1:
            diff=b['g']-b['cpar']
            if diff==0: cline+=' · Par de campo'
            elif diff<0: cline+=f' · {-diff} bajo par'
        if len(best)==1: dl=d(b['date'])
        elif len(best)==2: dl=f"Y la firmaste dos veces:<br>{d(best[0]['date'],False)} y {d(best[1]['date'],False)}"
        else: dl=f"La firmaste {len(best)} veces;<br>la más reciente, {d(best[-1]['date'],False)}"
        o+=f'''<!-- MEJOR RONDA -->
<tr><td class="pad" style="padding:34px 38px 12px">
<table role="presentation" width="100%" bgcolor="#e9eddf"><tr><td style="padding:25px 26px">
<p class="f11 label" style="color:#53664a;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase">La tarjeta para recordar</p>
<table role="presentation" width="100%"><tr><td class="f112 score" width="1" style="font-family:Georgia,serif;font-size:112px;line-height:1.1;letter-spacing:-7px;white-space:nowrap">{b['g']}</td><td style="padding-left:20px"><p class="f21" style="font-size:21px;font-weight:bold">Tu mejor ronda</p><p class="f15" style="font-size:15px;margin-top:9px">{cline}</p><p class="f13" style="font-size:13px;color:#586b52;margin-top:8px">{dl}</p></td></tr></table>
</td></tr></table>
</td></tr>
'''
    # RONDAS Y CAMPOS
    rsub = 'Todas de 18 hoyos' if nine==0 else f"{rounds-nine} de 18 hoyos y {nine} de 9"
    c1=cell(rounds,'Rondas jugadas',rsub,True)
    top=s['top'][0]
    impr = (s['first'][0]['g']-b['g']) if (b and s['first']) else 0
    if t['courses']>=2:
        c2=cell(t['courses'],'Campos distintos',(f"{top['course']}<br>{top['n']} rondas" if top['n']>1 else 'Una ronda en cada uno'),False)
    elif impr>=3:
        f0=s['first'][0]; mm=MES[int(f0['date'][5:7])-1]
        c2=cell(f'−{impr}','Golpes de mejora',f"De {f0['g']} en {mm}<br>a {b['g']} en tu mejor ronda",False)
    else:
        c2=cell(top['n'],'Rondas en tu campo',top['course'],False)
    o+=f'''
<!-- RONDAS Y CAMPOS -->
<tr><td class="pad" style="padding:14px 38px 28px">
<table role="presentation" width="100%"><tr>{c1}{c2}</tr></table>
</td></tr>
'''
    # BARRERAS
    th=[(80,t['u80']),(90,t['u90']),(100,t['u100'])]
    pick=[x for x in th if x[1]>0][:2]
    if pick:
        title = 'Tus rondas buenas<br>ya no son casualidad.' if (t['u80']>=10 or (full and t['u80']/full>=0.15)) else ('Rompiendo tus<br>propias marcas.' if t['u80']>0 else 'Cada vez más cerca<br>de tus mejores números.')
        n=len(pick)
        cells=''.join(cell(c,('Vez' if c==1 else 'Veces')+f' bajo {k}',frac(c,full),i==0,n) for i,(k,c) in enumerate(pick))
        o+=f'''
<!-- ROMPIENDO BARRERAS -->
<tr><td class="pad" style="padding:0 38px 30px">
<table role="presentation" width="100%" style="border-top:1px solid #d7dccf"><tr><td style="padding-top:24px">
<p class="f11 label" style="color:#68766b;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase">Rompiendo barreras</p>
<h2 class="f27" style="font-family:Georgia,serif;font-size:27px;font-weight:normal;letter-spacing:-.6px;margin:10px 0 20px">{title}</h2>
<table role="presentation" width="100%"><tr>
{cells}
</tr></table>
</td></tr></table>
</td></tr>
'''
    # MOMENTOS
    mc=[]
    if t['birdies']: mc.append((t['birdies'],'Birdie' if t['birdies']==1 else 'Birdies',per_round(t['birdies'],rounds)))
    if t['eagles']: mc.append((t['eagles'],'Águila' if t['eagles']==1 else 'Águilas','Dos golpes bajo par'))
    if t['hio']: mc.append((t['hio'],'Hoyo en uno' if t['hio']==1 else 'Hoyos en uno','El sueño de todo golfista'))
    if len(mc)<2 and t['pars']: mc.append((t['pars'],'Par' if t['pars']==1 else 'Pares',pars_round(t['pars'],rounds)))
    if mc:
        n=len(mc)
        cells=''.join(gcell(a,l,su,i==0,n) for i,(a,l,su) in enumerate(mc))
        o+=f'''
<!-- MOMENTOS DE LA TEMPORADA -->
<tr><td class="pad" bgcolor="#123e32" style="padding:30px 38px;color:#faf9f3">
<p class="f11 label" style="color:#d5b65d;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase">Momentos de la temporada</p>
<h2 class="f27" style="font-family:Georgia,serif;font-size:27px;font-weight:normal;letter-spacing:-.6px;margin:10px 0 22px;color:#faf9f3">Los hoyos que se celebran.</h2>
<table role="presentation" width="100%"><tr>
{cells}
</tr></table>
</td></tr>
'''
    # PUTTS
    if t['putts'] is not None and float(t['putts'])<=36.0 and t['putts_n']>=3:
        o+=f'''
<!-- PUTTS -->
<tr><td class="pad" style="padding:28px 38px 30px">
<p class="f11 label" style="color:#68766b;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase">Tu juego en el green</p><p style="margin-top:10px"><span class="f34" style="font-size:34px;font-weight:bold;letter-spacing:-1px">{float(t['putts']):.1f}</span> <span class="f15" style="font-size:15px">putts por ronda</span></p><p class="f13 small" style="font-size:13px;line-height:1.6;color:#68766b">Promedio de {t['putts_n']} rondas con registro de putts</p>
</td></tr>
'''
    # COMPETENCIA
    w,l=m['wins'],m['losses']; money_on = (w+l)>0
    if money_on:
        tot=w+l; pw=round(100*w/tot)
        bar=''
        if w: bar+=f'<td width="{pw}%" bgcolor="#1c6147" height="6" style="font-size:0;line-height:0">&nbsp;</td>'
        if l: bar+=f'<td width="{100-pw}%" bgcolor="#b6a78b" height="6" style="font-size:0;line-height:0">&nbsp;</td>'
        if w==0: sent=f"{tot} {'ronda' if tot==1 else 'rondas'} con resultado frente a tus rivales."
        elif l==0: sent='Ganaste todas tus rondas con resultado.'
        elif pw>=50: sent=f"Saliste ganando en {pw}% de tus rondas con resultado."
        else: sent=f"{w} de tus {tot} rondas con resultado cerraron a tu favor."
        boxes=[]
        if m['pos_n']>0: boxes.append(('pos',m['pos_n'],m['pos_sum']))
        if m['neg_n']>0: boxes.append(('neg',m['neg_n'],m['neg_sum']))
        bh=''
        for i,(k,c,amt) in enumerate(boxes):
            pad = '' if len(boxes)==1 else (' style="padding-right:6px"' if i==0 else ' style="padding-left:6px"')
            wd='100%' if len(boxes)==1 else '50%'
            riv='rival' if c==1 else 'rivales'
            if k=='pos':
                bh+=f'''<td width="{wd}" valign="top"{pad}><table role="presentation" width="100%" bgcolor="#e3ebdf" style="border:1px solid #c9d8c6;border-radius:6px"><tr><td style="padding:16px 16px 15px">
<p class="f11" style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1c6147">Saldo a favor</p>
<p class="f30" style="font-size:30px;font-weight:bold;letter-spacing:-1px;margin-top:8px;color:#163b31">{c}</p>
<p class="f13" style="font-size:13px;line-height:1.5;color:#53664a">{riv}</p>
<p class="f17" style="font-size:17px;font-weight:bold;margin-top:10px;padding-top:10px;border-top:1px solid #c9d8c6;color:#1c6147">{money(amt)}</p>
</td></tr></table></td>
'''
            else:
                bh+=f'''<td width="{wd}" valign="top"{pad}><table role="presentation" width="100%" bgcolor="#efe9dc" style="border:1px solid #ddd2bd;border-radius:6px"><tr><td style="padding:16px 16px 15px">
<p class="f11" style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#86765d">Saldo en contra</p>
<p class="f30" style="font-size:30px;font-weight:bold;letter-spacing:-1px;margin-top:8px;color:#163b31">{c}</p>
<p class="f13" style="font-size:13px;line-height:1.5;color:#86765d">{riv}</p>
<p class="f17" style="font-size:17px;font-weight:bold;margin-top:10px;padding-top:10px;border-top:1px solid #ddd2bd;color:#86765d">{money(amt)}</p>
</td></tr></table></td>
'''
        rv=m['rivals']
        o+=f'''
<!-- COMPETENCIA -->
<tr><td class="pad" bgcolor="#f0efe6" style="padding:27px 38px"><p class="f11 label" style="color:#68766b;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase">Frente a tus rivales</p><h2 class="f29" style="font-family:Georgia,serif;font-size:29px;font-weight:normal;letter-spacing:-.7px;margin:10px 0 22px">La competencia en números.</h2>
<table role="presentation" width="100%"><tr><td width="50%"><p class="f33" style="font-size:33px;font-weight:bold">{w}</p><p class="f13 small" style="font-size:13px;line-height:1.6;color:#68766b">{'Ronda ganada' if w==1 else 'Rondas ganadas'}</p></td><td width="50%"><p class="f33" style="font-size:33px;font-weight:bold;color:#86765d">{l}</p><p class="f13 small" style="font-size:13px;line-height:1.6;color:#68766b">{'Ronda perdida' if l==1 else 'Rondas perdidas'}</p></td></tr></table>
<table role="presentation" width="100%" style="margin-top:18px"><tr>{bar}</tr></table>
<p class="f13 small" style="margin-top:10px;font-size:13px;line-height:1.6;color:#68766b">{sent}</p>
<table role="presentation" width="100%" style="margin-top:25px;border-top:1px solid #d7dccf"><tr><td style="padding-top:22px">
<p class="f11 label" style="color:#68766b;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase">Tus rivales</p>
<p style="margin-top:10px"><span class="f34" style="font-size:34px;font-weight:bold;letter-spacing:-1px">{rv}</span> <span class="f15" style="font-size:15px">{'rival enfrentado' if rv==1 else 'rivales distintos enfrentados'}</span></p>
<p class="f13 small" style="font-size:13px;line-height:1.6;color:#68766b">Amigos registrados e invitados, de enero a septiembre</p>
<table role="presentation" width="100%" style="margin-top:18px"><tr>
{bh}</tr></table>
</td></tr></table>
</td></tr>
'''
        net=m['net']
        if round(net)>0:
            o+=f'''
<!-- BALANCE NETO -->
<tr><td class="pad" bgcolor="#123e32" align="center" style="padding:30px 38px;color:#faf9f3;text-align:center">
<p class="f11 label" style="color:#d5b65d;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase">Balance acumulado neto</p>
<p class="f54 gold" style="font-family:Georgia,serif;font-size:54px;line-height:1.1;color:#d5b65d;letter-spacing:-2px;margin-top:12px">{money(net)} <span class="f13" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0;color:#dbe5db">MXN</span></p>
<p class="f13" style="font-size:13px;line-height:1.6;color:#b9cabd;margin-top:6px">Enero – septiembre 2026</p>
</td></tr>
'''
        else:
            o+=f'''
<!-- BALANCE NETO -->
<tr><td class="pad" bgcolor="#e6e2d6" align="center" style="padding:24px 38px;text-align:center;border-top:1px solid #d7d1c1">
<p class="f11 label" style="color:#7d7565;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase">Balance acumulado neto</p>
<p class="f30" style="font-family:Georgia,serif;font-size:34px;line-height:1.1;color:#5f574a;letter-spacing:-1px;margin-top:10px">{money(net)} <span class="f13" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0;color:#7d7565">MXN</span></p>
<p class="f13" style="font-size:13px;line-height:1.6;color:#7d7565;margin-top:6px">Enero – septiembre 2026</p>
</td></tr>
'''
    o+='\n'+CLOSE
    # text version
    parts=[f"GreenBook · Highlights enero–septiembre 2026", (f"{fn}, cada ronda dejó su huella." if fn else "Cada ronda dejó su huella.")]
    if b: parts.append(f"Tu mejor ronda: {b['g']} en {b['course']}.")
    parts.append(f"Rondas jugadas: {rounds} ({rsub.lower()}). Campos distintos: {t['courses']}.")
    for k,c in pick: parts.append(f"Veces bajo {k}: {c}.")
    for a,lb,_ in mc: parts.append(f"{lb}: {a}.")
    if money_on:
        parts.append(f"Rondas ganadas: {w}. Rondas perdidas: {l}. Rivales: {m['rivals']}.")
        parts.append(f"Balance acumulado neto: {money(m['net'])} MXN.")
    parts.append("Ver mis resultados: https://golfgreenbookscf.com/")
    txt='\n'.join(parts)
    subj=(f"{fn}, tus Highlights GreenBook · Enero–Septiembre 2026" if fn else "Tus Highlights GreenBook · Enero–Septiembre 2026")
    mini=re.sub(r'<!--.*?-->','',o,flags=re.S); mini=re.sub(r'\n\s*','',mini)
    return mini,subj,txt,o
if __name__=='__main__':
    allp=json.load(open('all.json'))
    man=[]
    for s in allp:
        mini,subj,txt,full=build(s)
        open(f"out/{s['pid']}.html",'w').write(full)
        man.append({'pid':s['pid'],'name':s['name'],'to':s['email'],'subject':subj,'text':txt,'html':mini})
    json.dump(man,open('manifest.json','w'),ensure_ascii=False)
    for x in man: print(f"{x['name'][:26]:26} {len(x['html']):>6}  {x['subject']}")
