import { describe, expect, it } from 'vitest'
import { analyseMoves, headline, isSafe, legalMoves, replay, whiteChances } from '../src/moves'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const facts = (moves: string[]) => {
  const g = replay(START, moves)!
  return { g, facts: analyseMoves(g.pos, legalMoves(g.pos), { seen: g.seen.slice(0, -1), ownLast: g.played.at(-2) }) }
}
const find = (list: ReturnType<typeof analyseMoves>, uci: string) => list.find((f) => f.uci === uci)!

describe('replay', () => {
  it('replays a legal game and refuses an illegal move', () => {
    expect(replay(START, ['e2e4', 'e7e5'])?.played).toHaveLength(2)
    expect(replay(START, ['e2e5'])).toBeUndefined()
    expect(replay('not a fen', [])).toBeUndefined()
  })
})

describe('analyseMoves', () => {
  it('sees a mate in one, and says only that', () => {
    const { g, facts: f } = facts(['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6'])
    expect(find(f, 'h5f7').mates).toBe(true)
    expect(headline(g.pos, f)).toContain('CHECKMATE IS AVAILABLE THIS MOVE: Qxf7#')
  })
  it('flags a move that lets the opponent mate', () => {
    const { facts: f } = facts(['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4'])
    expect(find(f, 'g8f6').allowsMate).toBe(1)
    expect(isSafe(find(f, 'g8f6'))).toBe(false)
    expect(find(f, 'g7g6').allowsMate).toBeUndefined()
  })
  it('plays exchanges out to their net result', () => {
    const { facts: f } = facts(['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6'])
    const grab = find(f, 'h5e5')
    expect(grab.gain).toBe(1)
    expect(grab.net).toBeLessThan(0)
    expect(grab.description).toContain('down overall')
  })
  it('notices undoing a move and repeating a position', () => {
    const { facts: f } = facts(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6'])
    const back = find(f, 'f3g1')
    expect(back.description).toContain('undoes your last move')
    expect(back.description).toContain('repeats a position')
  })
})

describe('whiteChances', () => {
  it('is even at the start and sure at mate', () => {
    expect(whiteChances(replay(START, [])!.pos)).toBeCloseTo(0.5)
    const mated = replay(START, ['f2f3', 'e7e5', 'g2g4', 'd8h4'])!.pos
    expect(whiteChances(mated)).toBe(0)
  })
})
