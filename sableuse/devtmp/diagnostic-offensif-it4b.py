# Diagnostic D-O — où meurt l'offensive de Jev ? (journaux locaux, zéro API)
import json, glob, math, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from collections import Counter, defaultdict

def dist(a, b):
    # hex distance approx en axial (carte cylindrique E-O : on ignore le wrap, suffisant au diagnostic)
    if isinstance(a, str):
        aq, ar = a.split(','); a = {'q': int(aq), 'r': int(ar)}
    dq, dr = a['q'] - b['q'], a['r'] - b['r']
    return max(abs(dq), abs(dr), abs(dq + dr))

def charger(f):
    ev = []
    meta = None
    dec = []
    dip = []
    fins = None
    for line in open(f, encoding='utf-8'):
        d = json.loads(line)
        t = d.get('type')
        if t == 'evenement':
            ev.append(d['evenement'])
        elif t == 'meta':
            meta = d
        elif t == 'decision':
            dec.append(d)
        elif t == 'diplomatie':
            dip.append(d)
        elif t == 'fin':
            fins = d
    return meta, ev, dec, dip, fins

def analyser(f):
    meta, ev, dec, dip, fin = charger(f)
    seed = meta['meta']['seed'] if 'meta' in meta else meta['seed']
    capitals = {}  # owner -> position
    villes = {}    # cityId -> (owner, pos)
    combats = []   # (tour?, attackerId, defenderId, at, attAfter, defAfter)
    kills = defaultdict(int)  # owner victime
    moves_p1 = 0
    cities_at = {}  # unitId -> dernière position connue (événements Move/UnitKilled)
    # tours: evenement n'a pas de tour -> on suit seq vs les marqueurs tour
    # plus simple: reconstruire seq->tour à partir des lignes 'tour'? Elles n'ont pas de seq.
    # On balaye à nouveau en gardant l'ordre : 'tour' précède les événements du tour.
    tours = {}
    tour_courant = 0
    for line in open(f, encoding='utf-8'):
        d = json.loads(line)
        if d.get('type') == 'tour':
            tour_courant = d['tour']
        elif d.get('type') == 'evenement':
            e = d['evenement']
            t = e['type']
            if t == 'CityFounded':
                villes[e['cityId']] = (e['owner'], e['at'])
                if e.get('capital'):
                    capitals[e['owner']] = e['at']
            elif t == 'Attack':
                combats.append((tour_courant, e['attackerId'], e['defenderId'], e['at']))
            elif t == 'Combat' or (t == 'AttackResolved'):
                combats.append((tour_courant, e.get('attackerId'), e.get('defenderId'), e.get('at')))
            elif t == 'UnitKilled':
                by = e.get('byUnitId')
                if by: kills[by] += 1
            elif t == 'Move':
                if e['owner'] == 'p1':
                    moves_p1 += 1
                cities_at[e['unitId']] = e['to']
            elif t in ('UnitSpawned', 'CityProductionCompleted'):
                if 'unitId' in e: cities_at[e['unitId']] = e.get('at')

    guerres = [d for d in dip if d['genre'] == 'guerre' and d.get('ok')]
    paix_refusee = sum(1 for d in dip if d['genre'] == 'paix' and isinstance(d.get('reponseBot'), str) and d['reponseBot'] == 'refuse')
    print(f"\n=== seed {seed} ===  tours={dec[-1]['condense']['tour'] if dec else '?'}")
    print(f"capitales connues (CityFounded): {capitals}")
    print(f"guerres déclarées: {len(guerres)} aux tours {[d['tour'] for d in guerres]} ; propositions paix refusées: {paix_refusee}")
    print(f"mouvements p1: {moves_p1} ; combats (Attack/Combat): {len(combats)} ; kills par unité attaquante top: {Counter({k:v for k,v in kills.items()}).most_common(5)}")

    # quelle part des combats a lieu près de la capitale adverse vs chez Jev ?
    cap_adv = capitals.get('p2')
    if cap_adv:
        pres = sum(1 for (_, a, d_, at) in combats if dist(at, cap_adv) <= 3)
        loin = sum(1 for (_, a, d_, at) in combats if dist(at, capitals.get('p1', at)) <= 3)
        print(f"combats à ≤3 de la capitale ADVERSE: {pres} ; à ≤3 de la capitale de Jev: {loin}")
        # distance finale des unités p1 vivantes à la capitale adverse
        # dernière position = condensé final (unites)
        unis = dec[-1]['condense']['empire']['unites'] if dec else []
        dists = sorted(dist(u['case'], cap_adv) for u in unis)
        off = [u for u in unis if u['type'] not in ('colon', 'batisseur', 'explorateur', 'espion')]
        print(f"unités finales p1: {len(unis)} (offensives: {len(off)}) ; distances à la cap. adverse: min={dists[0] if dists else '-'} médiane={dists[len(dists)//2] if dists else '-'} max={dists[-1] if dists else '-'}")
        fort = sum(1 for u in unis if u.get('fortifiee'))
        print(f"fortifiées à la fin: {fort}/{len(unis)}")
        # la capitale adverse a-t-elle été atteinte (≤2) quelque part pendant la guerre ?
        atteinte_min = None
        for (_, a, d_, at) in combats:
            dd = dist(at, cap_adv)
            if atteinte_min is None or dd < atteinte_min: atteinte_min = dd
        print(f"distance min d'un combat à la capitale adverse: {atteinte_min}")
    # villes de Jev / bot en fin
    finc = dec[-1]['condense'] if dec else {}
    emp = finc.get('empire', {})
    print(f"villes p1 fin: {len(emp.get('villes', []))} ; rivaux: {json.dumps(finc.get('monde', {}).get('rivaux', []), ensure_ascii=False)[:200]}")
    if fin: print('fin:', json.dumps(fin, ensure_ascii=False)[:250])

for f in sorted(glob.glob('bancs/joueur-calibrage-2026-10-31/journaux/*.jsonl')):
    analyser(f)
print('\n--- STÉRILES (mini-rebanc) ---')
for f in sorted(glob.glob('bancs/joueur-it4b-steriles-2026-10-31/journaux/*.jsonl')):
    analyser(f)
