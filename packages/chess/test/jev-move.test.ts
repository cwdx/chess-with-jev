import { describe, expect, it } from 'vitest'
import type { JevAsk, JevQuestion } from '@cw/jev'
import { jevMove } from '../src/jev-move'
import { analyseMoves, isSafe, legalMoves, positionFrom } from '../src/moves'

const MATE = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1'
const QUIET = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1'

type Asked = Parameters<JevAsk>[0]
const offeredKeys = (q: Asked) => Object.keys((q.questions.pick as Extract<JevQuestion, { type: 'choice' }>).criteria)
const asking = () => {
  const asked: Asked[] = []
  const ask: JevAsk = async (q) => {
    asked.push(q)
    const keys = offeredKeys(q)
    return { answers: { pick: { choice: keys[0], confidence: 1, probabilities: { [keys[0]!]: 1 } } }, via: 'typesafe', cost: 0 }
  }
  return { ask, asked }
}

describe('jevMove', () => {
  it('plays a mate the rules find without asking, above easy', async () => {
    const { ask, asked } = asking()
    expect(await jevMove(ask, { start: MATE, moves: [], level: 'hard' })).toMatchObject({ uci: 'f3f7', forced: 'mate' })
    expect(asked).toHaveLength(0)
  })
  it('offers only the moves that lose nothing at normal, and every move at easy', async () => {
    const p = positionFrom(QUIET)!
    const facts = analyseMoves(p, legalMoves(p))
    const safe = facts.filter(isSafe).length
    expect(safe).toBeLessThan(facts.length)
    const criteria = async (level: string) => {
      const { ask, asked } = asking()
      const r = await jevMove(ask, { start: QUIET, moves: [], level })
      return { r, n: offeredKeys(asked[0]!).length }
    }
    const normal = await criteria('normal')
    expect(normal.n).toBe(safe)
    expect(normal.r).toMatchObject({ safe: true, offered: safe })
    expect((await criteria('easy')).n).toBe(facts.length)
  })
})
