import Foundation

/// What's being read — reading.json in the shared container. The reader
/// writes it; Home's "Continue reading" and the widgets read it.
public struct ReadingSnapshot: Codable, Hashable, Sendable {
    public static let fileName = "reading.json"

    public var documentID: String
    public var title: String
    /// Reading progress 0…1.
    public var progress: Double
    public var updatedAt: Date

    public init(documentID: String, title: String, progress: Double, updatedAt: Date = Date()) {
        self.documentID = documentID
        self.title = title
        self.progress = progress
        self.updatedAt = updatedAt
    }

    public static func load() -> ReadingSnapshot? { SharedContainer.read(ReadingSnapshot.self, from: fileName) }
    public func save() { SharedContainer.write(self, to: Self.fileName) }
}
