import { describe, expect, it } from 'vitest'
import { gatewayCost, hasJev, parseAnswers, sample } from '../src/index'

// The two routes' real responses to the same question (curl, 25 September 2026), trimmed: TypeSafe directly, and the
// AI Gateway, which adds its routing metadata.
const DIRECT = { model: 'jev-1.13.0', answers: { pick: { type: 'choice', choice: 'e2e4', confidence: 0.99, probabilities: { g1f3: 0.01, e2e4: 0.99 } }, risk: { type: 'noul', noul: 0.17 } }, usage: { input_tokens: 345, output_tokens: 57 } }
const GATEWAY = { ...DIRECT, model: 'typesafe-ai/jev', provider_metadata: { typesafe: { confidence: { pick: 0.98 } }, gateway: { routing: { finalProvider: 'typesafe-ai' } } } }

describe('parseAnswers', () => {
  it('reads both routes into the same shape', () => {
    for (const body of [DIRECT, GATEWAY]) {
      const r = parseAnswers(body)!
      expect(r.answers.pick).toEqual({ type: 'choice', choice: 'e2e4', confidence: 0.99, probabilities: { g1f3: 0.01, e2e4: 0.99 }, score: undefined, noul: undefined })
      expect(r.answers.risk!.noul).toBe(0.17)
    }
    expect(parseAnswers(GATEWAY)!.model).toBe('typesafe-ai/jev')
  })
  it('refuses a body without answers, and drops fields of the wrong type', () => {
    expect(parseAnswers({ error: 'nope' })).toBeNull()
    expect(parseAnswers('text')).toBeNull()
    const r = parseAnswers({ answers: { a: { type: 'weird', noul: '0.5', probabilities: { x: 'no', y: 0.4 } } } })!
    expect(r.answers.a).toMatchObject({ type: undefined, noul: undefined, probabilities: { y: 0.4 } })
  })
})

describe('routes', () => {
  it('reads what a gateway call cost', () => {
    expect(gatewayCost({ provider_metadata: { gateway: { cost: 0, marketCost: 0.00001155 } } })).toBe(0)
    expect(gatewayCost({ provider_metadata: { gateway: { cost: '0.0000116' } } })).toBeCloseTo(0.0000116)
    expect(gatewayCost(DIRECT)).toBeUndefined()
  })
  it('needs a key', () => {
    expect(hasJev({})).toBe(false)
    expect(hasJev({ typesafe: 'k' })).toBe(true)
  })
})

describe('sample', () => {
  const p = { a: 0.7, b: 0.25, c: 0.05, d: 0.001 }
  it('takes the first choice at temperature 0', () => expect(sample(p, ['a', 'b', 'c', 'd'], 0)).toBe('a'))
  it('never draws an option under 2%', () => {
    for (let i = 0; i < 200; i++) expect(sample(p, ['a', 'b', 'c', 'd'], 2)).not.toBe('d')
  })
})
