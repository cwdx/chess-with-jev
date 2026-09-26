import { attacks } from 'chessops/attacks'
import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { makeSan } from 'chessops/san'
import type { Color, NormalMove, Role, Square } from 'chessops/types'
import { makeUci, opposite, parseUci } from 'chessops/util'
import { materialBalance, squareName, VALUE } from './rules'

// What Jev is told about each move. Jev judges well but cannot calculate, so the chess facts are worked out here and
// written so there is nothing left to add up: an exchange is played out and given as its net result ("leaving you 3
// down overall"), and quiet moves carry enough detail (attackers and defenders, threats, development, repetition) that
// no two read alike. Learned from the public Jev chess builds.

export type LegalMove = { uci: string; san: string; move: NormalMove }
export type MoveFacts = LegalMove & {
  /** Material the move wins at once (a capture, a promotion). */
  gain: number
  /** The opponent's best capture in reply, played out as a full exchange. */
  reply?: { san: string; wins: number }
  /** gain minus the reply's winnings: what the move is worth in material. */
  net: number
  mates: boolean
  allowsMate: 1 | 2 | undefined
  forcesMate: boolean
  stalemates: boolean
  description: string
}

const points = (n: number) => `${n} point${n === 1 ? '' : 's'}`
const lastRank = (sq: Square) => sq >> 3 === 7 || sq >> 3 === 0
/** A move from `from` to `to`, promoting to a queen when a pawn reaches the last rank. */
const moveOf = (p: Chess, from: Square, to: Square): NormalMove => ({ from, to, promotion: p.board.get(from)?.role === 'pawn' && lastRank(to) ? 'queen' : undefined })
/** `p` after a move, leaving `p` as it was. */
export function afterMove(p: Chess, move: NormalMove) { const x = p.clone(); x.play(move); return x }

/** A position from FEN, or undefined when it is not a legal one. */
export function positionFrom(fen: unknown) {
  const setup = parseFen(String(fen ?? ''))
  const pos = setup.isOk ? Chess.fromSetup(setup.value) : undefined
  return pos?.isOk ? pos.value : undefined
}

/** A game replayed from its start: the position now, and every earlier one (for repetition). Undefined if a move is illegal. */
export function replay(start: unknown, ucis: unknown[]): { pos: Chess; seen: string[]; played: NormalMove[] } | undefined {
  const pos = positionFrom(start)
  if (!pos) return
  const seen = [positionKey(pos)], played: NormalMove[] = []
  for (const u of ucis) {
    const m = parseUci(String(u)) as NormalMove | undefined
    if (!m || !pos.isLegal(m)) return
    pos.play(m)
    played.push(m)
    seen.push(positionKey(pos))
  }
  return { pos, seen, played }
}
export const positionKey = (p: Chess) => makeFen(p.toSetup()).split(' ').slice(0, 4).join(' ')

/** Every legal move; promotions offer a queen and a knight. */
export function legalMoves(p: Chess): LegalMove[] {
  const moves: LegalMove[] = []
  for (const [from, tos] of p.allDests()) {
    const piece = p.board.get(from)!
    for (const to of tos) {
      const promo = piece.role === 'pawn' && lastRank(to) ? (['queen', 'knight'] as Role[]) : [undefined]
      for (const promotion of promo) {
        const move: NormalMove = { from, to, promotion }
        moves.push({ uci: makeUci(move), san: makeSan(p, move), move })
      }
    }
  }
  return moves
}

/** The legal captures onto `sq` for the side to move, cheapest capturing piece first. */
function capturesOnto(p: Chess, sq: Square): NormalMove[] {
  const out: { move: NormalMove; v: number }[] = []
  for (const [from, tos] of p.allDests()) {
    if (!tos.has(sq)) continue
    const piece = p.board.get(from)!
    out.push({ move: moveOf(p, from, sq), v: VALUE[piece.role] || 100 })
  }
  return out.sort((a, b) => a.v - b.v).map((x) => x.move)
}

/**
 * Static exchange: what the side to move wins by capturing on `sq` and letting the captures run, cheapest attacker
 * first, each side free to stop when going on would lose. 0 when capturing there does not pay.
 */
function exchange(p: Chess, sq: Square, depth = 0): number {
  const target = p.board.get(sq)
  if (!target || target.color === p.turn || depth > 12) return 0
  const [first] = capturesOnto(p, sq)
  if (!first) return 0
  return Math.max(0, VALUE[target.role] + (first.promotion ? VALUE.queen - VALUE.pawn : 0) - exchange(afterMove(p, first), sq, depth + 1))
}

/** The opponent's (side to move's) most profitable capture anywhere, as an exchange. */
function bestCapture(p: Chess): { san: string; wins: number } | undefined {
  let best: { san: string; wins: number } | undefined
  for (const sq of p.board[opposite(p.turn)]) {
    const wins = exchange(p, sq)
    if (wins > 0 && (!best || wins > best.wins)) best = { san: makeSan(p, capturesOnto(p, sq)[0]!), wins }
  }
  return best
}

function hasMateInOne(p: Chess): boolean {
  for (const [from, tos] of p.allDests()) for (const to of tos) if (afterMove(p, moveOf(p, from, to)).isCheckmate()) return true
  return false
}

/** Whether the side to move can force mate in two: a check after which every reply allows mate. Checks only, to stay cheap. */
function hasMateInTwo(p: Chess): boolean {
  for (const [from, tos] of p.allDests()) {
    for (const to of tos) {
      const x = afterMove(p, moveOf(p, from, to))
      if (x.isCheck() && !x.isEnd() && everyReplyAllowsMate(x)) return true
    }
  }
  return false
}

/** Whether every legal reply in `p` leaves the other side a mate in one. */
function everyReplyAllowsMate(p: Chess): boolean {
  for (const [from, tos] of p.allDests()) for (const to of tos) if (!hasMateInOne(afterMove(p, moveOf(p, from, to)))) return false
  return true
}

/** The back rank a side's pieces start on. */
const homeRank = (c: Color) => (c === 'white' ? 0 : 7)

/**
 * The facts of every legal move, and a description of each for Jev. `seen` holds the game's earlier positions (for
 * repetition) and `ownLast` the mover's previous move (to spot one undone).
 */
export function analyseMoves(p: Chess, moves: LegalMove[], opts: { seen?: string[]; ownLast?: NormalMove } = {}): MoveFacts[] {
  const us = p.turn, them = opposite(us)
  return moves.map((m) => {
    const { move, san } = m
    const piece = p.board.get(move.from)!, taken = p.board.get(move.to)
    const castles = san.startsWith('O-O')
    const gain = (taken && taken.color !== us ? VALUE[taken.role] : 0) + (move.promotion ? VALUE[move.promotion] - VALUE.pawn : 0)
    const after = afterMove(p, move)
    const mates = after.isCheckmate(), stalemates = after.isStalemate()
    const reply = mates || after.isEnd() ? undefined : bestCapture(after)
    const net = gain - (reply?.wins ?? 0)
    const allowsMate = mates || after.isEnd() ? undefined : hasMateInOne(after) ? 1 : hasMateInTwo(after) ? 2 : undefined
    const forcesMate = !mates && after.isCheck() && !after.isEnd() && everyReplyAllowsMate(after)

    // the landing square, and what the moved piece now threatens (skipped for castling, where the "to" is the rook)
    const landed = after.board.get(castles ? move.from : move.to)
    const at = castles ? undefined : move.to
    const attackers = at === undefined ? 0 : after.kingAttackers(at, them, after.board.occupied).size()
    const defenders = at === undefined ? 0 : after.kingAttackers(at, us, after.board.occupied).size()
    const threats: string[] = []
    if (landed && at !== undefined && !mates) {
      for (const sq of attacks(landed, at, after.board.occupied).intersect(after.board[them])) {
        const target = after.board.get(sq)!
        if (target.role === 'king') continue
        const defended = after.kingAttackers(sq, them, after.board.occupied).nonEmpty()
        if (VALUE[target.role] > VALUE[landed.role] || !defended) threats.push(`the ${target.role} on ${squareName(sq)}`)
      }
    }
    const develops = (piece.role === 'knight' || piece.role === 'bishop') && move.from >> 3 === homeRank(us) && move.to >> 3 !== homeRank(us)
    const undoes = !!opts.ownLast && opts.ownLast.from === move.to && opts.ownLast.to === move.from
    const repeats = opts.seen ? opts.seen.filter((k) => k === positionKey(after)).length : 0

    const notes: string[] = []
    if (mates) notes.push('CHECKMATE, wins the game')
    else {
      notes.push(castles ? 'castles' : `${piece.role} to ${squareName(move.to)}`)
      if (taken && taken.color !== us) notes.push(`takes a ${taken.role} (${points(VALUE[taken.role])})`)
      if (move.promotion) notes.push(`promotes to a ${move.promotion}`)
      if (after.isCheck()) notes.push('gives check')
      if (forcesMate) notes.push('forces checkmate next move')
      if (stalemates) notes.push('STALEMATE: the game is drawn at once')
      if (allowsMate === 1) notes.push('LOSES: lets the opponent checkmate next move')
      else if (allowsMate === 2) notes.push('LOSES: lets the opponent force checkmate in two')
      if (reply) {
        const overall = net < 0 ? `leaving you ${points(-net)} down overall, a blunder` : net > 0 ? `leaving you ${points(net)} up overall` : 'which only evens it out'
        notes.push(`but then the opponent wins ${points(reply.wins)} with ${reply.san}, ${overall}`)
      } else if (gain > 0) notes.push(`wins ${points(gain)} safely`)
      if (at !== undefined && landed && landed.role !== 'king' && !reply) notes.push(attackers ? `lands attacked by ${attackers}, defended by ${defenders}` : 'lands on a safe square')
      if (threats.length) notes.push(`threatens ${threats.join(' and ')}`)
      if (develops) notes.push('develops a piece')
      if (undoes) notes.push('undoes your last move')
      if (repeats) notes.push(`repeats a position already seen ${repeats === 1 ? 'once' : `${repeats} times`}`)
    }
    return { ...m, gain, reply, net, mates, allowsMate, forcesMate, stalemates, description: `${san}: ${notes.join('; ')}` }
  })
}

/** A move loses nothing: no material given away, no mate allowed. */
export const isSafe = (f: MoveFacts) => f.mates || (f.net >= 0 && !f.allowsMate && !f.stalemates)

/** The line Jev reads first: who it is, how many moves are safe, and a mate if there is one, alone. */
export function headline(p: Chess, facts: MoveFacts[]): string {
  const side = p.turn === 'white' ? 'White (the UPPERCASE pieces)' : 'Black (the lowercase pieces)'
  const mate = facts.find((f) => f.mates)
  if (mate) return `You are ${side}. CHECKMATE IS AVAILABLE THIS MOVE: ${mate.san}. Nothing else in this position matters.`
  const safe = facts.filter(isSafe).length
  const material = (p.turn === 'white' ? 1 : -1) * materialBalance(p)
  const standing = material === 0 ? 'Material is even' : material > 0 ? `You are ${points(material)} up in material` : `You are ${points(-material)} down in material`
  return `You are ${side}${p.isCheck() ? ', and you are in check' : ''}. ${standing}. ${facts.length} legal move${facts.length === 1 ? '' : 's'}; ${safe === facts.length ? 'none loses material' : `${safe} of them lose${safe === 1 ? 's' : ''} nothing`}.`
}

/**
 * White's winning chances in `p`, 0–1, worked out rather than asked: material, plus the best capture the side to move
 * has, as centipawns through the usual winning-chances curve. Jev reads positions well but cannot count; the eval
 * bar shows this.
 */
export function whiteChances(p: Chess): number {
  if (p.isCheckmate()) return p.turn === 'white' ? 0 : 1
  if (p.isEnd()) return 0.5
  const capture = bestCapture(p)?.wins ?? 0
  const cp = 100 * (materialBalance(p) + (p.turn === 'white' ? capture : -capture))
  return 1 / (1 + Math.exp(-0.00368208 * cp))
}

/** Jev's priorities, in order, for the pick. */
export const PRIORITIES = 'Choose the best move for you. Priorities, in order: 1. deliver checkmate, or force it; 2. never allow checkmate; 3. do not lose material (avoid every move marked "down overall"); 4. win material when it is safe; 5. then make progress: develop your pieces, castle, take the centre, create threats. Do not shuffle a piece back and forth or repeat positions unless you are losing.'
