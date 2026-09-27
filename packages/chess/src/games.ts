import { makePiece } from 'chessops/fen'
import { makeSan } from 'chessops/san'
import type { Chess } from 'chessops/chess'
import type { NormalMove } from 'chessops/types'
import { parseUci } from 'chessops/util'
import { positionFrom, positionKey } from './moves'
import { backRank, isPositionId, materialBalance, startFen } from './rules'

// Replayed and scored here, so a record is only ever a legal game that really ended, whatever a client says.
export const GAME_MODES = ['jev', 'simple', 'friend', 'jev-jev', 'jev-simple'] as const
export type GameMode = (typeof GAME_MODES)[number]
export type Seat = 'human' | 'jev' | 'simple'
export type GameResult = '1-0' | '0-1' | '1/2-1/2'
// either way round
const SEATS: Record<GameMode, string> = { 'jev': 'human jev', 'simple': 'human simple', 'friend': 'human human', 'jev-jev': 'jev jev', 'jev-simple': 'jev simple' }
export const seatsFit = (mode: GameMode, white: Seat, black: Seat) => [white, black].sort().join(' ') === SEATS[mode].split(' ').sort().join(' ')
export const MAX_PLIES = 600

export type ScoredGame = {
  result: GameResult
  reason: string
  winner?: 'white' | 'black'
  sans: string[]
  squares: string[]
  check?: number
  balance: number[]
}

function ending(pos: Chess, seen: string[]): { winner?: 'white' | 'black'; reason: string } | undefined {
  if (pos.isCheckmate()) return { winner: pos.turn === 'white' ? 'black' : 'white', reason: 'Checkmate' }
  if (pos.isStalemate()) return { reason: 'Stalemate' }
  if (pos.isInsufficientMaterial()) return { reason: 'Insufficient material' }
  if (pos.halfmoves >= 100) return { reason: 'Fifty-move rule' }
  if (seen.filter((k) => k === seen.at(-1)).length >= 3) return { reason: 'Threefold repetition' }
}

/** Undefined unless every move is legal and the game is over. */
export function scoreGame(n: number, moves: unknown): ScoredGame | undefined {
  if (!isPositionId(n) || !Array.isArray(moves) || !moves.length || moves.length > MAX_PLIES) return
  const pos = positionFrom(startFen(backRank(n)))
  if (!pos) return
  const seen = [positionKey(pos)], sans: string[] = [], balance = [materialBalance(pos)]
  for (const u of moves) {
    const m = parseUci(String(u)) as NormalMove | undefined
    if (!m || !pos.isLegal(m)) return
    sans.push(makeSan(pos, m))
    pos.play(m)
    seen.push(positionKey(pos))
    balance.push(materialBalance(pos))
  }
  const end = ending(pos, seen)
  if (!end) return
  const squares = Array.from({ length: 64 }, (_, sq) => { const piece = pos.board.get(sq); return piece ? makePiece(piece) : '' })
  return {
    ...end, result: end.winner === 'white' ? '1-0' : end.winner === 'black' ? '0-1' : '1/2-1/2',
    sans, squares, check: pos.isCheck() ? pos.board.kingOf(pos.turn) : undefined, balance,
  }
}
