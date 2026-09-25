import { describe, expect, it } from 'vitest'
import { gameHeadline } from '../src/headline'
import { STANDARD } from '../src/rules'
import { scoreGame, seatsFit } from '../src/games'

const FOOLS_MATE = ['f2f3', 'e7e5', 'g2g4', 'd8h4']

describe('chess games', () => {
  it('scores a finished game from its moves', () => {
    const g = scoreGame(STANDARD, FOOLS_MATE)!
    expect(g).toMatchObject({ result: '0-1', reason: 'Checkmate', winner: 'black', sans: ['f3', 'e5', 'g4', 'Qh4#'] })
    expect(g.squares.filter(Boolean)).toHaveLength(32)
    expect(g.balance).toHaveLength(5)
    expect(g.check).toBe(4) // the white king on e1
  })
  it('keeps no game that is unfinished, illegal or out of range', () => {
    expect(scoreGame(STANDARD, FOOLS_MATE.slice(0, 3))).toBeUndefined()
    expect(scoreGame(STANDARD, ['e2e5'])).toBeUndefined()
    expect(scoreGame(STANDARD, [])).toBeUndefined()
    expect(scoreGame(960, FOOLS_MATE)).toBeUndefined()
    expect(scoreGame(STANDARD, 'f2f3')).toBeUndefined()
  })
  it('scores a threefold repetition as a draw', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8']
    expect(scoreGame(STANDARD, [...shuffle, ...shuffle])).toMatchObject({ result: '1/2-1/2', reason: 'Threefold repetition' })
  })
  it('checks who sat at the board against the mode', () => {
    expect(seatsFit('jev', 'jev', 'human')).toBe(true)
    expect(seatsFit('jev', 'human', 'human')).toBe(false)
    expect(seatsFit('jev-jev', 'jev', 'jev')).toBe(true)
    expect(seatsFit('jev-simple', 'simple', 'jev')).toBe(true)
  })
})

describe('game headlines', () => {
  it('names who beat whom, by colour when both sides are the same player', () => {
    expect(gameHeadline('jev', 'simple', 'white')).toBe('Jev beat the simple engine.')
    expect(gameHeadline('human', 'jev', 'black')).toBe('Jev beat a person.')
    expect(gameHeadline('jev', 'jev', 'black')).toBe('Black (Jev) beat White (Jev).')
    expect(gameHeadline('human', 'simple')).toBe('A draw between a person and the simple engine.')
  })
})
