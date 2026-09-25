# @cw/jev

A small client for [TypeSafe AI](https://docs.typesafe.ai/api)'s Jev (System One): typed questions over one state,
answered as calibrated probabilities rather than text. Plain `fetch`, no SDK, no dependencies.

- **Two routes to the same model**, tried in order: Vercel's AI Gateway (its TypeSafe-compatible endpoint), then
  TypeSafe directly. Give either key or both.
- **One time budget per call**, with one retry for a server error, a short rate-limit wait or a dropped connection.
  Any failure answers `null`, so callers keep working without Jev.
- **Answers checked field by field** into one shape, whichever route answered.
- **Cost reported** per call: what the gateway says it cost, or the input tokens at TypeSafe's list price.

```ts
import { jevAsk, jevChoose } from '@cw/jev'

const keys = { gateway: process.env.AI_GATEWAY_API_KEY, typesafe: process.env.TYPESAFE_API_KEY }

// one Choice: null unless the answer is one of the options
const pick = await jevChoose(keys, {
  state: { message: 'Hi, are you open to a quick call about SEO services?' },
  instructions: 'What is this message?',
  criteria: { personal: 'A personal message', outreach: 'Sales or marketing outreach', spam: 'Spam' },
})
// → { choice: 'outreach', probabilities: { … }, confidence, via: 'gateway' }

// several typed questions over one state, answered in parallel in one call
const r = await jevAsk(keys, {
  state: { position: '…' },
  questions: {
    risk: { type: 'noul', instructions: 'Is the king in danger?' },
    sharp: { type: 'score', instructions: 'How sharp is it?', criteria: ['Quiet', 'Tense', 'Sharp'] },
  },
})
```

An optional last argument, `observe(result, ms)`, is told of every call once it is over: for logging, limits or a
spend cap.

MIT licence.
