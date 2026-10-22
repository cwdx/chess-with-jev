import { describe, expect, it, vi } from "vitest"
import { jevAskImage } from "../src/index"

describe("Jev experimental image input", () => {
  it("sends the PNG only to TypeSafe with the opt-in header and a narrow image reference", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      model: "jev-1.14.0", answers: { match: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 300 },
    }), { status: 200 }))
    try {
      const result = await jevAskImage({ gateway: "gateway", typesafe: "direct" }, {
        state: { instruction: "Draw a house" }, imageBase64: "aGVsbG8=",
        questions: { match: { type: "noul", instructions: "Does this look like a house?" } },
      })
      expect(result?.via).toBe("typesafe")
      expect(result?.answers.match?.noul).toBe(0.9)
      expect(fetch).toHaveBeenCalledTimes(1)
      const [url, request] = fetch.mock.calls[0]!
      expect(url).toBe("https://api.typesafe.ai/v1/systemone")
      const headers = request!.headers as Record<string, string>
      expect(headers["TypeSafe-Danger-Zone-Images"]).toBe("true")
      const body = JSON.parse(String(request!.body))
      expect(body.model).toBe("jev-preview")
      expect(body.state.image).toBe("<image:primary>")
      expect(body.assets["<image:primary>"]).toEqual({ type: "image", format: "png", data_base64: "aGVsbG8=" })
      expect(body.questions.match.type).toBe("noul")
    } finally {
      fetch.mockRestore()
    }
  })
  it("never sends an experimental image through an ordinary gateway key", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
    expect(await jevAskImage({ gateway: "gateway" }, { state: {}, imageBase64: "aGVsbG8=", questions: {} })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRestore()
  })
})
