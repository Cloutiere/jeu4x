/**
 * Parsing des arguments du bot — isolé pour être testé (L2, Phase 5).
 *
 * `pnpm bot -- <CODE> <nom>` : pnpm transmet le `--` littéralement au script ;
 * il est filtré ici (régression du 30/08 — le code de partie était `--`).
 */
export function parseBotArgs(argv) {
  const args = argv.filter((a) => a !== '--');
  const [codeArg, nameArg] = args;
  const code = (codeArg ?? '').toUpperCase();
  return { code, valid: /^[A-Z0-9]{6}$/.test(code), name: nameArg ?? 'Bot' };
}
