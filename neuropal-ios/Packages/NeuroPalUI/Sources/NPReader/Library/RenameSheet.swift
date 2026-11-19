import NPCore
import NPTheme
import SwiftUI

/// Rename a document (title and an optional subtitle).
struct RenameSheet: View {
    @Environment(\.npTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    let document: NPDocument
    var onSave: (_ title: String, _ subtitle: String?) async -> Bool
    @State private var title: String
    @State private var subtitle: String
    @State private var saving = false
    @FocusState private var focused: Bool

    init(document: NPDocument, onSave: @escaping (_ title: String, _ subtitle: String?) async -> Bool) {
        self.document = document
        self.onSave = onSave
        _title = State(initialValue: document.title)
        _subtitle = State(initialValue: document.subtitle ?? "")
    }

    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var changed: Bool {
        trimmedTitle != document.title
            || subtitle.trimmingCharacters(in: .whitespacesAndNewlines) != (document.subtitle ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title, axis: .vertical)
                        .font(theme.bodyFont)
                        .focused($focused)
                        .submitLabel(.done)
                    TextField("Subtitle (optional)", text: $subtitle, axis: .vertical)
                        .font(theme.bodyFont)
                } header: {
                    SkinLabel("Name")
                } footer: {
                    Text("The new name shows on every device you use.")
                        .font(theme.font(.body, size: 13, relativeTo: .footnote))
                        .foregroundStyle(theme.onSurfaceVariant)
                }
                .listRowBackground(theme.surfaceHigh)
            }
            .scrollContentBackground(.hidden)
            .background(theme.surfaceContainer)
            .foregroundStyle(theme.onSurface)
            .navigationTitle("Rename")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(trimmedTitle.isEmpty || !changed || saving)
                }
            }
            .onAppear { focused = true }
        }
    }

    private func save() {
        saving = true
        let sub = subtitle.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            let ok = await onSave(trimmedTitle, sub.isEmpty ? nil : sub)
            saving = false
            if ok { dismiss() }
        }
    }
}
