// Chess960 starting positions by the standard numbering (518 is the classical setup), the simple engine, and what a
// game's material says about it. The rules of play are chessops'.
import type { Chess } from 'chessops/chess'
import type { NormalMove, Role } from 'chessops/types'

export const STANDARD = 518
export const POSITIONS = 960

export const isPositionId = (n: number) => Number.isInteger(n) && n >= 0 && n < POSITIONS

const divmod = (a: number, b: number) => [Math.floor(a / b), a % b] as const
const KNIGHTS: [number, number][] = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]

/** White's back rank for position `n`, a to h, e.g. 518 → "RNBQKBNR". */
export function backRank(n: number): string {
  if (!isPositionId(n)) throw new Error(`Chess960 position must be 0–959, not ${n}`)
  const rank = new Array<string>(8).fill('')
  const empty = () => rank.flatMap((v, i) => (v ? [] : [i]))
  const [n2, b1] = divmod(n, 4)
  rank[b1 * 2 + 1] = 'B' // light-squared bishop: b, d, f, h
  const [n3, b2] = divmod(n2, 4)
  rank[b2 * 2] = 'B' // dark-squared bishop: a, c, e, g
  const [n4, q] = divmod(n3, 6)
  rank[empty()[q]!] = 'Q'
  const [k1, k2] = KNIGHTS[n4]!
  const free = empty()
  rank[free[k1]!] = 'N'
  rank[free[k2]!] = 'N'
  const [r1, k, r2] = empty()
  rank[r1!] = 'R'; rank[k!] = 'K'; rank[r2!] = 'R'
  return rank.join('')
}

/** The starting position as FEN, the input chessops parses (castling rights on both sides, outermost rooks). */
export const startFen = (rank: string) => `${rank.toLowerCase()}/pppppppp/8/8/8/8/PPPPPPPP/${rank} w KQkq - 0 1`

/** The starting board as 64 FEN piece letters ('' for empty), indexed like chessops: a1 = 0, h1 = 7, h8 = 63. */
export function startSquares(rank: string): string[] {
  const back = [...rank]
  return Array.from({ length: 64 }, (_, sq) => {
    const r = sq >> 3, f = sq & 7
    return r === 0 ? back[f]! : r === 1 ? 'P' : r === 6 ? 'p' : r === 7 ? back[f]!.toLowerCase() : ''
  })
}

const FILES = 'abcdefgh'
/** Square index to name, e.g. 0 → a1, 63 → h8. */
export const squareName = (sq: number) => `${FILES[sq & 7]}${(sq >> 3) + 1}`
/** a1 is dark, so a square is dark when its file and rank indices add up to an even number. */
export const isDarkSquare = (sq: number) => ((sq & 7) + (sq >> 3)) % 2 === 0

export const NAMES: Record<string, string> = { R: 'Rook', N: 'Knight', B: 'Bishop', Q: 'Queen', K: 'King', P: 'Pawn' }

export const setup = (rank: string) =>
  [...rank].map((piece, i) => ({ piece, name: NAMES[piece]!, white: `${FILES[i]}1`, black: `${FILES[i]}8` }))

/**
 * The simple engine: mate if it can, otherwise the best capture or check, avoiding squares it would lose. It works on
 * a chessops position it is handed (types only here, so core never loads chessops).
 */
export function simpleMove(p: Chess): NormalMove | undefined {
  let best: { move: NormalMove; score: number } | undefined
  for (const [from, tos] of p.allDests()) {
    const mover = p.board.get(from)!
    for (const to of tos) {
      const move: NormalMove = { from, to, promotion: mover.role === 'pawn' && (to >> 3 === 7 || to >> 3 === 0) ? 'queen' : undefined }
      const after = p.clone()
      after.play(move)
      let score = Math.random() * 0.5
      if (after.isCheckmate()) score += 1000
      if (after.isCheck()) score += 0.6
      const taken = p.board.get(to)
      if (taken && taken.color !== mover.color) score += VALUE[taken.role] * 10
      if (move.promotion) score += 80
      const landed = after.board.get(move.to)
      if (landed && [...after.allDests().values()].some((d) => d.has(move.to))) score -= VALUE[landed.role] * 9
      if (!best || score > best.score) best = { move, score }
    }
  }
  return best?.move
}

/** What each piece is worth, in points. */
export const VALUE: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 }
/** White's material minus Black's, in points. */
export function materialBalance(p: Chess): number {
  let n = 0
  for (const sq of p.board.occupied) { const x = p.board.get(sq)!; n += (x.color === 'white' ? 1 : -1) * VALUE[x.role] }
  return n
}

/**
 * What a game's material says about it. `balance` is White's lead before each move and after the last (length plies
 * + 1). A move is marked when, with the reply, it won (`!`) or lost (`?`) 3 points or more, and the move that allowed a
 * mate is marked `?`. The summary names the mate, and when the winner went ahead for good and by how much when that
 * was 3 points or more; in a draw, how the material ended.
 */
export function materialStory(balance: number[], sans: string[], winner?: 'white' | 'black'): { marks: ('' | '!' | '?')[]; summary: string } {
  const marks = sans.map((_, i) => {
    const s = i % 2 === 0 ? 1 : -1, j = Math.min(i + 2, balance.length - 1)
    const d = s * (balance[j]! - balance[i]!)
    return d >= 3 ? '!' : d <= -3 ? '?' : ''
  }) as ('' | '!' | '?')[]
  const end = balance.at(-1)!
  if (!winner) return { marks, summary: end === 0 ? 'Material ended even.' : `${end > 0 ? 'White' : 'Black'} ended ${Math.abs(end)} point${Math.abs(end) === 1 ? '' : 's'} up.` }
  const s = winner === 'white' ? 1 : -1, name = winner === 'white' ? 'White' : 'Black'
  // a win is a checkmate: the loser's last move allowed it
  if (sans.length >= 2 && !marks[sans.length - 2]) marks[sans.length - 2] = '?'
  const mate = `${name} mated on move ${Math.floor((sans.length - 1) / 2) + 1} with ${sans.at(-1)}.`
  let from = balance.length - 1
  while (from > 0 && s * balance[from - 1]! > 0) from--
  if (s * balance[from]! <= 0) return { marks, summary: `${mate} No material lead needed.` }
  const most = Math.max(...balance.slice(from).map((b) => s * b))
  if (most < 3) return { marks, summary: mate }
  const ply = from - 1 // the move that put the winner ahead
  return { marks, summary: `${mate} Ahead from move ${Math.floor(ply / 2) + 1} (${sans[ply]}), by up to ${most} points.` }
}
