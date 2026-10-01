import { generateProceduralMap } from '../src/progen/index.js';
// Invariance : les seeds saines doivent produire EXACTEMENT la même carte
// qu'avant le correctif (1er passage consomme le même flux RNG).
const avant = {
  1: '24,3 26,16 0,13 31,5 2,6', // à recalculer depuis le worktree pré-fix
};
for (const seed of [1, 7920, 15839, 23758, 31677, 3714012]) {
  const { map } = generateProceduralMap(seed);
  const sig = map.villages.map(v=>`${v.q},${v.r}`).join(' ')+'#'+map.huts.map(h=>`${h.q},${h.r}`).join(' ')+'#'+map.resources.map(r=>`${r.id}:${r.q},${r.r}`).join(' ');
  console.log(`seed ${seed} : ${sig}`);
}
