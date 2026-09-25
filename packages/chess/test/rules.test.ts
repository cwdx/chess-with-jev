import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { describe, expect, it } from 'vitest'
import { backRank, isPositionId, materialStory, POSITIONS, simpleMove, STANDARD, startFen } from '../src/rules'

const at = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap()

describe('Chess960 positions', () => {
  it('numbers 960 positions, 518 being the classical setup', () => {
    expect(POSITIONS).toBe(960)
    expect(backRank(STANDARD)).toBe('RNBQKBNR')
    expect(startFen(backRank(STANDARD))).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  })
  it('keeps the rules for every position: bishops on both colours, the king between the rooks', () => {
    const seen = new Set<string>()
    for (let n = 0; n < POSITIONS; n++) {
      const rank = backRank(n)
      seen.add(rank)
      const b = [...rank].flatMap((p, i) => (p === 'B' ? [i % 2] : []))
      expect(b.sort()).toEqual([0, 1])
      const [r1, k, r2] = [rank.indexOf('R'), rank.indexOf('K'), rank.lastIndexOf('R')]
      expect(r1 < k && k < r2).toBe(true)
    }
    expect(seen.size).toBe(POSITIONS)
  })
  it('rejects numbers out of range', () => {
    expect(isPositionId(0)).toBe(true)
    expect(isPositionId(959)).toBe(true)
    expect(isPositionId(960)).toBe(false)
    expect(isPositionId(1.5)).toBe(false)
  })
})

describe('materialStory', () => {
  it('names a quick mate and marks the move that allowed it', () => {
    const sans = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']
    const balance = [0, 0, 0, 0, 0, 0, 0, 1]
    const { marks, summary } = materialStory(balance, sans, 'white')
    expect(summary).toBe('White mated on move 4 with Qxf7#.')
    expect(marks[5]).toBe('?')
  })
  it('marks a move that won three points or more with the reply', () => {
    const { marks } = materialStory([0, 0, 9, 9], ['Bxq', 'Kd7', 'e4'])
    expect(marks[0]).toBe('!')
  })
  it('says how a draw ended in material', () => expect(materialStory([0, 2], ['e4']).summary).toBe('White ended 2 points up.'))
})

describe('simpleMove', () => {
  it('takes a queen left hanging', () => {
    const p = at('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1')
    expect(simpleMove(p)).toMatchObject({ from: 28, to: 35 })
  })
  it('mates when it can', () => {
    const p = at('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1')
    expect(simpleMove(p)).toMatchObject({ from: 0, to: 56 })
  })
})
