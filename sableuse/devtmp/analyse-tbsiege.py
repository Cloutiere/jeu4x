# Analyse banc TB-SIEGE (journaux locaux, zéro API) — métriques du handoff :
# percée, captures de capitales, victoires, stériles, guerres avant rencontre,
# fondations, réaction front B (course ONU).
import json, glob, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from collections import defaultdict

def dist(a, b):
    if isinstance(a, str):
        aq, ar = a.split(','); a = {'q': int(aq), 'r': int(ar)}
    dq, dr = a['q'] - b['q'], a['r'] - b['r']
    return max(abs(dq), abs(dr), abs(dq + dr))

def analyser(f):
    meta = None; evs = []; fin = None; declarations = []; wars = set()
    tour = 0; rivauxParTour = {}
    villes = {}; capitales = {}  # cityId -> (owner, pos, capital) ; owner -> cityId
    combats = []  # (tour, attacker, defender, at)
    fondations = 0; fondationsJev = 0
    proprio = {}  # unitId -> owner (dernier connu — Move/UnitProduced/Spawned)
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
                if e.get('capital'):
                    capitales[e['owner']] = e['cityId']
                if e['owner'] == 'p1': fondationsJev += 1
            elif k == 'CombatExchange':
                combats.append((tour, e.get('attackerId'), e.get('defenderId'), e.get('at')))
            elif k == 'CityCaptured':
                cid = e.get('cityId')
                if cid in villes: villes[cid] = (e.get('toOwner'), villes[cid][1], villes[cid][2])
            elif k == 'WarDeclared':
                wars.add((e.get('a') or e.get('from') or e.get('player'), e.get('b') or e.get('to') or e.get('target'), tour))
            elif k in ('Move',):
                proprio[e.get('unitId')] = e.get('owner')
            elif k in ('UnitProduced', 'UnitSpawned', 'BarbarianSpawned'):
                proprio[e.get('unitId') or e.get('id')] = e.get('owner')
        elif t == 'fin': fin = d
    seed = meta.get('seed')
    jev = fin.get('nationJev') or 'p1'
    gagnant = fin.get('gagnant')
    # capitales adverses (de p2) et de Jev
    autres = [pid for pid in capitales if pid != jev]
    capAdv = [(cid, villes[cid][1]) for owner, cid in capitales.items() if owner != jev and cid in villes]
    capJev = [(cid, villes[cid][1]) for owner, cid in capitales.items() if owner == jev and cid in villes]
    # guerres de Jev : déclarations T2 de Jev (canal diplomatie) + guerres inter-nations impliquant Jev (fin)
    guerresJevPaires = [g for g in fin.get('guerresInterNations', []) if jev in g.split('|')]
    # percée : combats IMPLIQUANT UNE UNITÉ DE JEV à ≤ 3 de la capitale ADVERSE
    # (les combats barbares près d'une capitale ne sont pas une percée de Jev)
    percee = False; distMin = 999; combatsProches = 0
    for (t, a, dfn, at) in combats:
        if not at: continue
        if proprio.get(a) != jev and proprio.get(dfn) != jev: continue
        for (cid, pos) in capAdv:
            dd = dist(at, pos)
            distMin = min(distMin, dd)
            if dd <= 3: combatsProches += 1; percee = True
    # captures de capitales : CityCaptured d'une ville à capital=True
    capCapturesJev = []   # capitales prises PAR Jev
    capCapturesContre = [] # capitales de Jev prises
    # re-balayage pour CityCaptured avec capitalité
    villes2 = {}
    for line in open(f, encoding='utf-8'):
        d = json.loads(line)
        if d.get('type') != 'evenement': continue
        e = d['evenement']; k = e.get('type')
        if k == 'CityFounded':
            villes2[e['cityId']] = (e['owner'], bool(e.get('capital')))
        elif k == 'CityCaptured':
            cid = e.get('cityId')
            info = villes2.get(cid)
            if info and info[1]:
                if e.get('toOwner') == jev: capCapturesJev.append((d, cid, info[0]))
                if info[0] == jev: capCapturesContre.append((d, cid))
    # guerres avant rencontre : déclaration T2 Jev un tour où rivaux connus = 0
    avantRencontre = [d for d in declarations if d.get('ok') and d.get('de') == jev and rivauxParTour.get(d.get('tour'), 0) == 0]
    nDeclJev = len([d for d in declarations if d.get('ok') and d.get('de') == jev])
    return {
        'fichier': os.path.basename(f), 'seed': seed, 'gagnant': gagnant,
        'gagnantJev': gagnant is not None and fin.get('joueursFin', {}).get(gagnant, {}) is not None and gagnant == jev,
        'tours': fin.get('toursJoues'), 'cout': fin.get('coutTotalUsd', 0),
        'declJev': nDeclJev, 'declJevTours': [d.get('tour') for d in declarations if d.get('ok') and d.get('de') == jev],
        'guerresJev': len(guerresJevPaires),
        'percee': percee, 'distMinCap': distMin, 'combatsProches': combatsProches,
        'capCapturesJev': len(capCapturesJev), 'capCapturesContre': len(capCapturesContre),
        'avantRencontre': len(avantRencontre),
        'fondations': fondations, 'fondationsJev': fondationsJev,
        'erreurs': fin.get('erreursJev', 0),
    }

if __name__ == '__main__':
    dossier = sys.argv[1] if len(sys.argv) > 1 else 'bancs/joueur-tbsiege-2026-10-31/journaux'
    res = [analyser(f) for f in sorted(glob.glob(os.path.join(dossier, '*.jsonl')))]
    for r in res:
        print(json.dumps(r, ensure_ascii=False))
    parties = len(res)
    if parties:
        print('--- TOTAUX ---')
        print('victoires Jev            :', sum(1 for r in res if r['gagnantJev']), '/', parties)
        print('guerres (paires) Jev     :', sum(r['guerresJev'] for r in res))
        print('percée                   :', sum(1 for r in res if r['percee']), '/', parties,
              '(', round(100 * sum(1 for r in res if r['percee']) / parties), '% des parties )')
        print('captures capitales (Jev) :', sum(r['capCapturesJev'] for r in res))
        print('capitales Jev prises     :', sum(r['capCapturesContre'] for r in res))
        print('stériles sans déclaration:', sum(1 for r in res if r['declJev'] == 0), '/', parties)
        print('guerres avant rencontre  :', sum(r['avantRencontre'] for r in res))
        print('fondations Jev/partie    :', round(sum(r['fondationsJev'] for r in res) / parties, 1))
        print('coût total $             :', round(sum(r['cout'] for r in res), 4))
        print('erreurs API              :', sum(r['erreurs'] for r in res))
