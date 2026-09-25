// TypeSafe Jev (docs.typesafe.ai/api): typed questions over one state, answered as calibrated probabilities rather
// than text; the questions in a call run in parallel. Plain fetch, no SDK. Two routes to the same model, tried in
// order: Vercel's AI Gateway (its TypeSafe-compatible endpoint), then TypeSafe directly. Each is bounded by the call's
// time budget with one retry for a server error, a short rate-limit wait or a dropped connection; any failure answers
// null, so callers keep working without it. Both routes answer in the same shape (checked below); the gateway adds
// routing metadata, which is ignored.
export type JevQuestion
  = | { type: 'choice'; instructions: string; criteria: Record<string, string> }
    | { type: 'score'; instructions: string; criteria: string[] }
    | { type: 'noul'; instructions: string }
export type JevAnswer = { type?: 'choice' | 'score' | 'noul'; choice?: string; score?: number; noul?: number; probabilities?: Record<string, number>; confidence?: number }
export type JevChoice = { choice: string; probabilities: Record<string, number>; confidence?: number; model?: string }
export type JevRoute = 'gateway' | 'typesafe'
export type JevKeys = { gateway?: string; typesafe?: string }
/** `cost` is in US dollars: what the gateway reports, or for TypeSafe directly the input tokens at its list price. */
export type JevResult = { answers: Record<string, JevAnswer>; model?: string; via: JevRoute; cost: number }
/** Told of every call once it is over: its result (null when no route answered) and how long it took. */
export type JevObserver = (result: JevResult | null, ms: number) => void

const ROUTES: Record<JevRoute, { url: string; model: string }> = {
  gateway: { url: 'https://ai-gateway.vercel.sh/typesafe/v1/systemone', model: 'typesafe-ai/jev' },
  typesafe: { url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest' },
}

// Vercel's AI Gateway serves Jev free under a promotion that "ends on September 25, 2026", with no time or timezone given
// (its model page, 25 September 2026). So the free period is read from the gateway itself: each response reports what
// the call cost, and once one costs anything, it is over (for this server instance). At the latest it ends when 25
// September ends everywhere (UTC−12). While it lasts, callers skip their rate limits.
export const GATEWAY_FREE_UNTIL = Date.parse('2026-09-26T12:00:00Z')
let gatewayCharging = false
export const gatewayFree = (keys: JevKeys, now = Date.now()) => !!keys.gateway && now < GATEWAY_FREE_UNTIL && !gatewayCharging
/** What a gateway response says the call cost (provider_metadata.gateway.cost), or undefined when it does not say. */
export function gatewayCost(body: unknown): number | undefined {
  const meta = isRecord(body) && isRecord(body.provider_metadata) && isRecord(body.provider_metadata.gateway) ? body.provider_metadata.gateway : undefined
  const cost = meta ? Number(meta.cost) : NaN
  return Number.isFinite(cost) ? cost : undefined
}
/** For tests: forget that the gateway has started charging. */
export const resetGatewayCharging = () => { gatewayCharging = false }
export const hasJev = (keys: JevKeys) => !!(keys.gateway || keys.typesafe)
/** TypeSafe's list price: $0.042 per million input tokens, output free (docs.typesafe.ai, September 2026). */
export const PRICE_PER_INPUT_TOKEN = 0.042 / 1e6

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** The answers of a response, checked field by field (an unexpected shape answers null rather than half an answer). */
export function parseAnswers(body: unknown): Pick<JevResult, 'answers' | 'model'> | null {
  if (!isRecord(body) || !isRecord(body.answers)) return null
  const answers: Record<string, JevAnswer> = {}
  for (const [id, raw] of Object.entries(body.answers)) {
    if (!isRecord(raw)) continue
    const type = raw.type === 'choice' || raw.type === 'score' || raw.type === 'noul' ? raw.type : undefined
    const probabilities = isRecord(raw.probabilities)
      ? Object.fromEntries(Object.entries(raw.probabilities).flatMap(([k, p]) => (num(p) === undefined ? [] : [[k, num(p)!]])))
      : undefined
    answers[id] = { type, choice: typeof raw.choice === 'string' ? raw.choice : undefined, score: num(raw.score), noul: num(raw.noul), probabilities, confidence: num(raw.confidence) }
  }
  return { answers, model: typeof body.model === 'string' ? body.model : undefined }
}

async function askVia(route: JevRoute, key: string, q: { state: unknown; questions: Record<string, JevQuestion> }, deadline: number) {
  const { url, model } = ROUTES[route]
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = deadline - Date.now()
    if (left < 300) return null
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'authorization': `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, state: q.state, questions: q.questions }),
        signal: AbortSignal.timeout(left),
      })
      if (res.ok) {
        const body = await res.json()
        const reported = route === 'gateway' ? gatewayCost(body) : undefined
        if ((reported ?? 0) > 0) gatewayCharging = true
        const parsed = parseAnswers(body)
        const tokens = isRecord(body) && isRecord(body.usage) ? num(body.usage.input_tokens) ?? 0 : 0
        return parsed && { ...parsed, cost: reported ?? tokens * PRICE_PER_INPUT_TOKEN }
      }
      const wait = res.status === 429 ? Number(res.headers.get('retry-after') ?? NaN) * 1000 : res.status >= 500 ? 200 : NaN
      if (!(wait >= 0) || Date.now() + wait > deadline - 300) return null
      await new Promise((r) => setTimeout(r, wait))
    } catch (e) {
      if ((e as Error).name === 'TimeoutError') return null
    }
  }
  return null
}

/** Ask Jev: the gateway first when it has a key, TypeSafe directly as the fallback, within one time budget. */
export async function jevAsk(keys: JevKeys, q: { state: unknown; questions: Record<string, JevQuestion>; timeoutMs?: number }, observe?: JevObserver): Promise<JevResult | null> {
  const t0 = Date.now()
  const deadline = t0 + (q.timeoutMs ?? 2500)
  let result: JevResult | null = null
  for (const route of ['gateway', 'typesafe'] as const) {
    const key = keys[route]
    if (!key) continue
    const r = await askVia(route, key, q, deadline)
    if (r) { result = { ...r, via: route }; break }
  }
  observe?.(result, Date.now() - t0)
  return result
}

/** One `choice` question; null unless the answer is one of the options. */
export async function jevChoose(keys: JevKeys, q: { state: unknown; instructions: string; criteria: Record<string, string>; timeoutMs?: number }, observe?: JevObserver): Promise<(JevChoice & { via: JevRoute }) | null> {
  const r = await jevAsk(keys, { state: q.state, questions: { pick: { type: 'choice', instructions: q.instructions, criteria: q.criteria } }, timeoutMs: q.timeoutMs }, observe)
  const pick = r?.answers.pick
  if (!r || !pick?.choice || !(pick.choice in q.criteria)) return null
  return { choice: pick.choice, probabilities: pick.probabilities ?? {}, confidence: pick.confidence, model: r.model, via: r.via }
}
