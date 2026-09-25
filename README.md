# Chess with Jev

The code behind [Chess with Jev](https://chriswijnia.com/experiments/chess): browser chess and Chess960 where code
works out every legal move's facts and [TypeSafe AI](https://docs.typesafe.ai/api)'s Jev (System One) picks one per
turn, as a single typed Choice over the legal moves.

| Package | What it is | Licence |
| --- | --- | --- |
| [`packages/jev`](packages/jev) | A small Jev client: the Vercel AI Gateway first, TypeSafe directly as the fallback, answers checked, cost reported | MIT |
| [`packages/chess`](packages/chess) | Every legal move's facts, Jev's move decision, Chess960 positions, finished games scored; on chessops | GPL-3.0 |

```sh
npm install
npm test          # the packages' unit tests (no Jev calls)
npm run typecheck
```

This repository is a mirror: it is copied from the site's monorepo on every change there, so pull requests are read
but applied upstream.
