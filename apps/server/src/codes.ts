/**
 * Codes de partie — L4. Alphabet sans ambiguïté (pas de I/L/O/0/1) : 31
 * caractères, 6 positions → ~887 millions de combinaisons. Le code EST le nom
 * du GameDO (idFromName) et le lien d'invitation /join/<code>.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** Génère un code candidat (la vérification de collision est du ressort de l'appelant). */
export function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return code;
}

/** Valide le format d'un code (URL /join/<code>, JoinGame). */
export function isValidCode(code: string): boolean {
  return new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(code);
}

/** Graine RNG pour une nouvelle partie (uint32 — le moteur est seedé, R-80). */
export function generateSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) >>> 0;
}
