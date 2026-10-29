import Foundation

// Pal: /api/pal/* (docs/BRAIN.md §4).
// SKELETON — owned by the Core agent; every method still throws.
extension HTTPNeuroPalAPI {
    public func palBreakdown(task: String) async throws -> PalBreakdown { throw APIError.server(status: 501, message: "not built yet") }
    public func palChat(message: String, context: PalChatContext?) async throws -> PalChatReply {
        throw APIError.server(status: 501, message: "not built yet")
    }
    public func clearPalChat() async throws { throw APIError.server(status: 501, message: "not built yet") }
}
