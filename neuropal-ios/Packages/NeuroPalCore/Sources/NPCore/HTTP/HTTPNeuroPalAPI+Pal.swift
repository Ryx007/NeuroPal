import Foundation

// Pal: /api/pal/* (docs/BRAIN.md §4, neuropal-backend/src/routes/pal.js).
// Per user 30 chats and 30 breakdowns an hour → 429 `rateLimited`; a model
// failure is a 502 and the app falls back to its offline tools.
extension HTTPNeuroPalAPI {
    /// POST /api/pal/breakdown `{task ≤ 500}` → 3–7 small steps.
    public func palBreakdown(task: String) async throws -> PalBreakdown {
        try await json("POST", "/pal/breakdown", body: BreakdownBody(task: task), timeout: Timeout.model)
    }

    /// POST /api/pal/chat `{message ≤ 1000, context?}` → `{reply, crisis}`.
    public func palChat(message: String, context: PalChatContext?) async throws -> PalChatReply {
        try await json("POST", "/pal/chat", body: PalChatBody(message: message, context: context), timeout: Timeout.model)
    }

    /// DELETE /api/pal/chat — "Clear chat" removes the server's copy too.
    public func clearPalChat() async throws {
        try await send("DELETE", "/pal/chat")
    }
}

struct BreakdownBody: Encodable {
    let task: String
}

struct PalChatBody: Encodable {
    let message: String
    let context: PalChatContext?
}
