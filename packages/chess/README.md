# @cw/chess

Chess and Chess960 for Jev. Jev judges well but cannot calculate, so the chess is worked out in code and Jev is asked
one typed question it can answer: which of these moves.

- **Every legal move's facts** (`moves.ts`): exchanges played out to a net result, mate in one or two allowed or
  forced, attackers and defenders, threats, development, repetition, written so no two moves read alike.
- **Jev's move** (`jev-move.ts`): the game is replayed, the facts become the options of one `Choice`, asked together
  with a king-danger `Noul`, a sharpness `Score` and a plan `Choice`. Jev can only answer with a legal move; a pick
  that gives material away while a safe move exists is asked once more, with the reason. Levels draw from Jev's own
  probabilities at a temperature.
- **Chess960** (`rules.ts`): the 960 starting positions by the standard numbering (518 is the classical setup), a
  simple engine, and what a game's material says about it.
- **Finished games** (`games.ts`): replayed and scored from their moves, so only a legal game that really ended counts.

```ts
import { jevAsk } from '@cw/jev'
import { jevMove } from '@cw/chess'

const keys = { gateway: process.env.AI_GATEWAY_API_KEY, typesafe: process.env.TYPESAFE_API_KEY }
const move = await jevMove((q) => jevAsk(keys, q), {
  start: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves: ['e2e4', 'e7e5'],
  variant: 'chess',
  level: 'hard',
})
// → { uci: 'g1f3', san: 'Nf3', candidates: [{ uci, san, p }, …], confidence, reading: { eval, kingRisk, sharpness, plan }, … }
```

The browser-safe entries `@cw/chess/rules` and `@cw/chess/headline` use chessops only for types, so a page can import
them without loading chessops up front.

Built on [chessops](https://github.com/niklasf/chessops) (GPL-3.0), so this package is GPL-3.0 too.
