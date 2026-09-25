import { makeSan } from 'chessops/san'
import type { NormalMove, Role } from 'chessops/types'
import { parseUci } from 'chessops/util'
import { positionFrom, positionKey } from './moves'
import { backRank, isPositionId, materialBalance, startFen } from './rules'

// A finished game, replayed and scored from its position and moves (UCI), so a record is only ever a legal game that
// really ended, whatever a client says; a game left unfinished scores nothing. The modes and seats are the chess
// page's: who may sit at the board in each.
export const GAME_MODES = ['jev', 'simple', 'friend', 'jev-jev', 'jev-simple'] as const
export type GameMode = (typeof GAME_MODES)[number]
export type Seat = 'human' | 'jev' | 'simple'
export type GameResult = '1-0' | '0-1' | '1/2-1/2'
// who may sit at the board in each mode, either way round
const SEATS: Record<GameMode, string> = { 'jev': 'human jev', 'simple': 'human simple', 'friend': 'human human', 'jev-jev': 'jev jev', 'jev-simple': 'jev simple' }
export const isGameMode = (v: unknown): v is GameMode => GAME_MODES.includes(v as GameMode)
export const seatsFit = (mode: GameMode, white: Seat, black: Seat) => [white, black].sort().join(' ') === SEATS[mode].split(' ').sort().join(' ')
export const MAX_PLIES = 600

const LETTER: Record<Role, string> = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' }

export type ScoredGame = {
  result: GameResult
  reason: string
  winner?: 'white' | 'black'
  sans: string[]
  squares: string[]
  check?: number
  balance: number[]
}

// how the game in `pos` has ended, if it has; `seen` is every position so far, for repetition
function ending(pos: NonNullable<ReturnType<typeof positionFrom>>, seen: string[]): { winner?: 'white' | 'black'; reason: string } | undefined {
  if (pos.isCheckmate()) return { winner: pos.turn === 'white' ? 'black' : 'white', reason: 'Checkmate' }
  if (pos.isStalemate()) return { reason: 'Stalemate' }
  if (pos.isInsufficientMaterial()) return { reason: 'Insufficient material' }
  if (pos.halfmoves >= 100) return { reason: 'Fifty-move rule' }
  if (seen.filter((k) => k === seen.at(-1)).length >= 3) return { reason: 'Threefold repetition' }
}

/** Replay position `n` with `moves` (UCI) and score the end: undefined unless every move is legal and the game is over. */
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
  const squares = Array.from({ length: 64 }, (_, sq) => {
    const piece = pos.board.get(sq)
    return piece ? (piece.color === 'white' ? LETTER[piece.role].toUpperCase() : LETTER[piece.role]) : ''
  })
  return {
    ...end, result: end.winner === 'white' ? '1-0' : end.winner === 'black' ? '0-1' : '1/2-1/2',
    sans, squares, check: pos.isCheck() ? pos.board.kingOf(pos.turn) : undefined, balance,
  }
}
