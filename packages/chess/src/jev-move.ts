import { makeFen } from 'chessops/fen'
import { sample, type JevAsk } from '@cw/jev'
import { MAX_PLIES } from './games'
import { afterMove, analyseMoves, headline, isSafe, legalMoves, PRIORITIES, replay, whiteChances } from './moves'

export type JevMoveInput = { start?: unknown; moves?: unknown; history?: unknown; variant?: unknown; level?: unknown }
/** A game that cannot be played on from: not legal, or already over. */
export class ChessInputError extends Error {}

// temperatures for @cw/jev `sample`
const LEVELS = { easy: 2, normal: 1, hard: 0 } as const
const PLANS = {
  develop: 'Bring pieces out and castle', attack: 'Go after the enemy king', defend: 'Shore up threats against its own king',
  trade: 'Exchange pieces to simplify', push: 'Advance pawns for space or a passed pawn', win: 'Convert a material advantage',
}

/** Jev's move in the game `body` describes, at its level (easy, normal, hard); null if Jev did not answer. */
export async function jevMove(ask: JevAsk, body: JevMoveInput | undefined) {
  const temperature = LEVELS[String(body?.level) as keyof typeof LEVELS] ?? LEVELS.hard
  const game = Array.isArray(body?.moves) && body.moves.length <= MAX_PLIES ? replay(body.start, body.moves) : undefined
  if (!game) throw new ChessInputError('Not a legal game')
  const p = game.pos
  const moves = legalMoves(p)
  if (!moves.length) throw new ChessInputError('No legal moves')
  const history = Array.isArray(body?.history) ? body.history.slice(-40).map(String).join(' ') : ''
  const facts = analyseMoves(p, moves, { seen: game.seen.slice(0, -1), ownLast: game.played.at(-2) })

  const side = p.turn === 'white' ? 'White' : 'Black'
  const t0 = Date.now()
  // Above easy, code keeps the rules it can check: a mate is played, and only moves that lose nothing are offered.
  // Easy keeps its slips: weaker is the point of it
  const strict = temperature < LEVELS.easy
  const safe = facts.filter(isSafe), unmated = facts.filter((f) => !f.allowsMate)
  const mate = strict ? facts.find((f) => f.mates) ?? facts.find((f) => f.forcesMate) : undefined
  const offered = !strict ? facts : safe.length ? safe : unmated.length ? unmated : facts
  const only = facts.length === 1 ? 'legal' : mate ? 'mate' : offered.length === 1 ? 'safe' : undefined
  if (only) {
    const m = mate ?? offered[0]!
    return { uci: m.uci, san: m.san, candidates: [{ uci: m.uci, san: m.san, p: 1 }], confidence: 1, ms: Date.now() - t0, options: moves.length, forced: only, safe: isSafe(m), safeMoves: safe.length, reading: { eval: whiteChances(afterMove(p, m.move)) } }
  }
  const state = { situation: headline(p, facts), game: body?.variant === 'chess' ? 'Chess' : 'Chess960 (Fischer random chess)', youPlay: side, position: makeFen(p.toSetup()), movesSoFar: history || 'none' }
  const r = await ask({
    state,
    questions: {
      pick: { type: 'choice', criteria: Object.fromEntries(offered.map((f) => [f.uci, f.description])), instructions: `You play ${side}. ${strict && offered !== facts ? `Only the moves that ${offered === safe ? 'lose nothing' : 'do not allow mate'} are offered. ` : ''}${PRIORITIES}` },
      risk: { type: 'noul', instructions: `Is ${side}'s king in danger?` },
      sharp: { type: 'score', instructions: 'How sharp is the position: how much does one move decide?', criteria: ['Quiet', 'Tense', 'Sharp'] },
      plan: { type: 'choice', instructions: `What is ${side}'s plan here?`, criteria: PLANS },
    },
    timeoutMs: 12000,
  })
  const pick = r?.answers.pick
  const choice = pick?.probabilities ? sample(pick.probabilities, offered.map((f) => f.uci), temperature) ?? pick.choice : pick?.choice
  const picked = offered.find((m) => m.uci === choice)
  if (!r || !pick || !picked) return null
  const probabilities = pick.probabilities ?? {}
  const candidates = moves.map((m) => ({ uci: m.uci, san: m.san, p: probabilities[m.uci] ?? 0 })).sort((a, b) => b.p - a.p).slice(0, 5)
  const a = r.answers
  return {
    uci: picked.uci, san: picked.san, candidates, confidence: pick.confidence, model: r.model, via: r.via, ms: Date.now() - t0, options: moves.length, offered: offered.length,
    safe: isSafe(picked), safeMoves: safe.length,
    reading: {
      eval: whiteChances(afterMove(p, picked.move)),
      kingRisk: a.risk?.noul,
      sharpness: typeof a.sharp?.score === 'number' ? a.sharp.score / 2 : undefined,
      plan: a.plan?.choice,
    },
  }
}
