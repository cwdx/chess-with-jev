import { makeFen } from 'chessops/fen'
import { sample, type JevQuestion, type JevResult } from '@cw/jev'
import { MAX_PLIES } from './games'
import { afterMove, analyseMoves, headline, isSafe, legalMoves, PRIORITIES, replay, whiteChances } from './moves'

// Jev's chess move: given a game (its start and moves, UCI), replay it, work out every legal move's facts
// (moves.ts: exchanges, mates, threats, repetition) and ask Jev, in one call, for its move and a reading of the
// position (king danger, how sharp, the plan); who stands better is worked out, not asked. The answer is only ever a
// move from the legal list. `ask` is any Jev client call (@cw/jev `jevAsk` with its keys, or one that also limits
// and records calls); null means Jev did not answer.
export type JevAsk = (q: { state: unknown; questions: Record<string, JevQuestion>; timeoutMs?: number }) => Promise<JevResult | null>
export type JevMoveInput = { start?: unknown; moves?: unknown; history?: unknown; variant?: unknown; level?: unknown }
/** A game that cannot be played on from: not legal, or already over. */
export class ChessInputError extends Error {}

// how widely Jev's pick is drawn from its own probabilities (@cw/jev `sample`)
const LEVELS = { easy: 2, normal: 1, hard: 0 } as const
const PLANS = {
  develop: 'Bring pieces out and castle', attack: 'Go after the enemy king', defend: 'Shore up threats against its own king',
  trade: 'Exchange pieces to simplify', push: 'Advance pawns for space or a passed pawn', win: 'Convert a material advantage',
}

/** Jev's move in the game `body` describes, at its level (easy, normal, hard); null if Jev did not answer. */
export async function jevMove(ask: JevAsk, body: JevMoveInput | undefined) {
  const temperature = LEVELS[String(body?.level) as keyof typeof LEVELS] ?? LEVELS.hard
  const game = Array.isArray(body?.moves) && body.moves.length <= MAX_PLIES ? replay(body?.start, body.moves) : undefined
  if (!game) throw new ChessInputError('Not a legal game')
  const p = game.pos
  const moves = legalMoves(p)
  if (!moves.length) throw new ChessInputError('No legal moves')
  const history = Array.isArray(body?.history) ? body.history.slice(-40).map(String).join(' ') : ''
  const facts = analyseMoves(p, moves, { seen: game.seen.slice(0, -1), ownLast: game.played.at(-2) })

  const side = p.turn === 'white' ? 'White' : 'Black'
  const t0 = Date.now()
  // one legal move is no decision: play it without a call
  if (facts.length === 1) {
    const only = facts[0]!
    return { uci: only.uci, san: only.san, candidates: [{ uci: only.uci, san: only.san, p: 1 }], confidence: 1, ms: Date.now() - t0, options: 1, forced: true, safe: isSafe(only), safeMoves: Number(isSafe(only)), reading: { eval: whiteChances(afterMove(p, only.move)) } }
  }
  const state = { situation: headline(p, facts), game: body?.variant === 'chess' ? 'Chess' : 'Chess960 (Fischer random chess)', youPlay: side, position: makeFen(p.toSetup()), movesSoFar: history || 'none' }
  const pickQuestion = {
    type: 'choice' as const, criteria: Object.fromEntries(facts.map((f) => [f.uci, f.description])),
    instructions: `You play ${side}. ${PRIORITIES}`,
  }
  const r = await ask({
    state,
    questions: {
      pick: pickQuestion,
      risk: { type: 'noul', instructions: `Is ${side}'s king in danger?` },
      sharp: { type: 'score', instructions: 'How sharp is the position: how much does one move decide?', criteria: ['Quiet', 'Tense', 'Sharp'] },
      plan: { type: 'choice', instructions: `What is ${side}'s plan here?`, criteria: PLANS },
    },
    timeoutMs: 12000,
  })
  let pick = r?.answers.pick
  // only a move from our own list, drawn at the level's temperature (hard: Jev's first choice)
  const choose = (answer: typeof pick) => {
    const choice = answer?.probabilities ? sample(answer.probabilities, facts.map((f) => f.uci), temperature) ?? answer.choice : answer?.choice
    return choice ? facts.find((m) => m.uci === choice) : undefined
  }
  let picked = choose(pick)
  if (!r || !pick || !picked) return null
  // A pick that gives material away while a safe move exists is asked once more, with the reason, on the time that is
  // left (Easy keeps its slips: weaker is the point of it)
  let reasked = false
  if (temperature < LEVELS.easy && !isSafe(picked) && facts.some(isSafe)) {
    const again = await ask({
      state: { ...state, warning: `Your first choice, ${picked.description}. Choose again: a move that loses nothing is available.` },
      questions: { pick: pickQuestion },
      timeoutMs: Math.max(0, 12000 - (Date.now() - t0)),
    })
    const secondPick = again?.answers.pick
    const second = choose(secondPick)
    if (secondPick && second && isSafe(second)) { picked = second; pick = secondPick; reasked = true }
  }
  const probabilities = pick.probabilities ?? {}
  const candidates = moves.map((m) => ({ uci: m.uci, san: m.san, p: probabilities[m.uci] ?? 0 })).sort((a, b) => b.p - a.p).slice(0, 5)
  const a = r.answers
  return {
    uci: picked.uci, san: picked.san, candidates, confidence: pick.confidence, model: r.model, via: r.via, ms: Date.now() - t0, options: moves.length,
    // whether Jev's move gives nothing away, how many would have, and whether it took a second, warned ask
    safe: isSafe(picked), safeMoves: facts.filter(isSafe).length, reasked,
    reading: {
      // White's winning chances after the move, worked out (moves.ts), not asked
      eval: whiteChances(afterMove(p, picked.move)),
      kingRisk: a.risk?.noul,
      sharpness: typeof a.sharp?.score === 'number' ? a.sharp.score / 2 : undefined,
      plan: a.plan?.choice,
    },
  }
}
