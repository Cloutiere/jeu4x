/**
 * CHAT-SOCLE (Erik 29/10) — réducteur PUR du store de chat client
 * (lib/chat.ts) : accueil (rencontres persistées sans popup), message
 * temps réel + déduplication, historique (source de vérité serveur),
 * PlayerMet (rencontre + popup EN DIRECT uniquement).
 */
import { describe, expect, it } from 'vitest';
import type { ServerToClientMessage } from '@game/shared';
import { etatInitialChat, reduceChat } from '../src/lib/chat.js';

const msg = (over: Partial<Extract<ServerToClientMessage, { type: 'ChatMessage' }>['message']>) =>
  ({
    proto: 1,
    type: 'ChatMessage',
    message: { partie: 'ABC123', tour: 3, auteur: 'p1', canal: 'general', texte: 'salut', horodatage: 1, ...over },
  }) as ServerToClientMessage;

describe('CHAT-SOCLE · reduceChat (client)', () => {
  it('Welcome : les rencontres persistées déverrouillent SANS popup', () => {
    const e = reduceChat(etatInitialChat(), { proto: 1, type: 'Welcome', rencontres: ['p2'] } as ServerToClientMessage);
    expect(e.rencontres).toEqual(['p2']);
    expect(e.popupRencontre).toBeNull();
    expect(e.messages).toEqual([]);
  });

  it('ChatMessage : ajout à la file (général comme individuel)', () => {
    let e = etatInitialChat();
    e = reduceChat(e, msg({ canal: 'general', texte: 'a' }));
    e = reduceChat(e, msg({ canal: 'p2', auteur: 'p2', texte: 'b' }));
    expect(e.messages.map((m) => m.texte)).toEqual(['a', 'b']);
  });

  it('ChatMessage : déduplication (écho + historique croisés)', () => {
    let e = reduceChat(etatInitialChat(), msg({}));
    const doublon = reduceChat(e, msg({}));
    expect(doublon).toBe(e); // même référence — rien ajouté
  });

  it('ChatHistory : remplace la file (source de vérité serveur)', () => {
    let e = reduceChat(etatInitialChat(), msg({ texte: 'local' }));
    e = reduceChat(e, {
      proto: 1,
      type: 'ChatHistory',
      messages: [
        { partie: 'ABC123', tour: 1, auteur: 'p1', canal: 'general', texte: 'h1', horodatage: 1 },
        { partie: 'ABC123', tour: 2, auteur: 'p2', canal: 'p1', texte: 'h2', horodatage: 2 },
      ],
    } as ServerToClientMessage);
    expect(e.messages.map((m) => m.texte)).toEqual(['h1', 'h2']);
  });

  it('PlayerMet : rencontre + popup EN DIRECT, déverrouillage idempotent', () => {
    let e = reduceChat(etatInitialChat(), { proto: 1, type: 'PlayerMet', joueur: 'p2', tour: 4 } as ServerToClientMessage);
    expect(e.rencontres).toEqual(['p2']);
    expect(e.popupRencontre).toBe('p2');
    // double événement (ne doit jamais arriver — une fois par paire) : popup
    // inchangée, pas de doublon de rencontre.
    e = reduceChat(e, { proto: 1, type: 'PlayerMet', joueur: 'p2', tour: 5 } as ServerToClientMessage);
    expect(e.rencontres).toEqual(['p2']);
    expect(e.popupRencontre).toBe('p2');
  });

  it('messages hors périmètre chat : état inchangé (même référence)', () => {
    const e = etatInitialChat();
    expect(reduceChat(e, { proto: 1, type: 'OrderAck', accepted: true, order: null, reason: null } as ServerToClientMessage)).toBe(e);
    expect(reduceChat(e, { proto: 1, type: 'GameList', waiting: [], mine: [] } as ServerToClientMessage)).toBe(e);
  });
});
