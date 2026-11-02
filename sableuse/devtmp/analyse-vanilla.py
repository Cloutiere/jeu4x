# Analyse banc VANILLA (journaux locaux, zéro API) — HANDOFF-BANC-VANILLA L2 :
# mètre étendu aux LONGUES DURÉES (plafond 600) — victoire + RAISON + tour +
# villes/forces de fin + déclarations (qui, quand), à partir du mètre
# analyse-tbsiege.py (métriques siège conservées, consigné).
import json, glob, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def dist(a, b):
    if isinstance(a, str):
        aq, ar = a.split(','); a = {'q': int(aq), 'r': int(ar)}
    dq, dr = a['q'] - b['q'], a['r'] - b['r']
    return max(abs(dq), abs(dr), abs(dq + dr))

def analyser(f):
    meta = None; evs = []; fin = None; declarations = []
    tour = 0; rivauxParTour = {}
    villes = {}; capitales = {}
    combats = []; fondations = 0; fondationsJev = 0
    proprio = {}; victoire = None  # (tour, winner, reason)
    for line in open(f, encoding='utf-8'):
        d = json.loads(line)
        t = d.get('type')
        if t == 'meta': meta = d
        elif t == 'tour': tour = d['tour']
        elif t == 'decision':
            riv = ((d.get('condense') or {}).get('diplomatie') or {}).get('rivaux')
            if riv is not None: rivauxParTour[tour] = len(riv)
        elif t == 'diplomatie':
            if d.get('genre') == 'guerre': declarations.append(d)
        elif t == 'evenement':
            e = d['evenement']; k = e.get('type')
            if k == 'CityFounded':
                fondations += 1
                villes[e['cityId']] = (e['owner'], e.get('at'), bool(e.get('capital')))
                if e.get('capital'): capitales[e['owner']] = e['cityId']
                if e['owner'] == 'p1': fondationsJev += 1
            elif k == 'CombatExchange':
                combats.append((tour, e.get('attackerId'), e.get('defenderId'), e.get('at')))
            elif k == 'CityCaptured':
                cid = e.get('cityId')
                if cid in villes: villes[cid] = (e.get('toOwner'), villes[cid][1], villes[cid][2])
            elif k == 'Victory':
                victoire = (tour, e.get('winner'), e.get('reason'))
            elif k == 'Move':
                proprio[e.get('unitId')] = e.get('owner')
            elif k in ('UnitProduced', 'UnitSpawned', 'BarbarianSpawned'):
                proprio[e.get('unitId') or e.get('id')] = e.get('owner')
        elif t == 'fin': fin = d
    jev = fin.get('nationJev') or 'p1'
    gagnant = fin.get('gagnant')
    autres = [pid for pid in capitales if pid != jev]
    capAdv = [(cid, villes[cid][1]) for owner, cid in capitales.items() if owner != jev and cid in villes]
    jf = fin.get('joueursFin', {})
    declJev = [(d.get('tour'), d.get('cible'), d.get('mecanique', False)) for d in declarations if d.get('ok') and d.get('de') == jev]
    declBot = [(d.get('tour'), d.get('de')) for d in declarations if d.get('ok') and d.get('de') != jev]
    avantRencontre = [d for d in declarations if d.get('ok') and d.get('de') == jev and rivauxParTour.get(d.get('tour'), 0) == 0]
    # captures de capitales (re-balayage avec capitalité)
    villes2 = {}; capCapturesJev = 0; capCapturesContre = 0
    for line in open(f, encoding='utf-8'):
        d = json.loads(line)
        if d.get('type') != 'evenement': continue
        e = d['evenement']
        if e.get('type') == 'CityFounded': villes2[e['cityId']] = (e['owner'], bool(e.get('capital')))
        elif e.get('type') == 'CityCaptured':
            info = villes2.get(e.get('cityId'))
            if info and info[1]:
                if e.get('toOwner') == jev: capCapturesJev += 1
                if info[0] == jev: capCapturesContre += 1
    return {
        'fichier': os.path.basename(f), 'seed': meta.get('seed'),
        'gagnant': gagnant,
        'gagnantJev': gagnant == jev,
        'raisonVictoire': fin.get('raisonVictoire') or (victoire[2] if victoire and victoire[1] == gagnant else None),
        'tourVictoire': victoire[0] if victoire else None,
        'indechise600': gagnant is None,
        'tours': fin.get('toursJoues'), 'cout': fin.get('coutTotalUsd', 0),
        'villesJev': jf.get(jev, {}).get('villes'), 'villesBot': jf.get('p2', {}).get('villes'),
        'forcesJev': jf.get(jev, {}).get('forces'), 'forcesBot': jf.get('p2', {}).get('forces'),
        'techsJev': jf.get(jev, {}).get('techs'), 'techsBot': jf.get('p2', {}).get('techs'),
        'scoreJev': (fin.get('scores') or {}).get(jev, {}).get('total') if fin.get('scores') else None,
        'scoreBot': (fin.get('scores') or {}).get('p2', {}).get('total') if fin.get('scores') else None,
        'declJev': declJev, 'declBot': declBot,
        'avantRencontre': len(avantRencontre),
        'fondationsJev': fondationsJev,
        'capCapturesJev': capCapturesJev, 'capCapturesContre': capCapturesContre,
        'erreurs': fin.get('erreursJev', 0),
    }

if __name__ == '__main__':
    dossier = sys.argv[1] if len(sys.argv) > 1 else 'bancs/joueur-vanilla-2026-11-01/journaux'
    res = [analyser(f) for f in sorted(glob.glob(os.path.join(dossier, '*.jsonl')))]
    for r in res:
        print(json.dumps(r, ensure_ascii=False))
    parties = len(res)
    if parties:
        print('--- TOTAUX ---')
        print('victoires Jev            :', sum(1 for r in res if r['gagnantJev']), '/', parties)
        for r in res:
            print(f"  {r['fichier']}: gagnant={r['gagnant']} raison={r['raisonVictoire']} tour={r['tourVictoire']} indécise600={r['indechise600']}")
        print('indécises au plafond     :', sum(1 for r in res if r['indechise600']), '/', parties)
        print('guerres avant rencontre  :', sum(r['avantRencontre'] for r in res))
        print('captures capitales (Jev) :', sum(r['capCapturesJev'] for r in res))
        print('capitales Jev prises     :', sum(r['capCapturesContre'] for r in res))
        print('fondations Jev/partie    :', round(sum(r['fondationsJev'] for r in res) / parties, 1))
        print('coût total $             :', round(sum(r['cout'] for r in res), 4))
        print('erreurs API              :', sum(r['erreurs'] for r in res))
