import NPCore
import NPTheme
import SwiftUI
import UIKit

/// Chat with a document: answers grounded in it, each with the pages it
/// comes from. A citation shows its passage in the reader. On iPhone the
/// reader presents this in a sheet; on iPad it sits beside the text.
public struct AskView: View {
    public let documentID: String
    @Environment(AppSession.self) private var session
    @Environment(AppNavigator.self) private var nav
    @Environment(\.npTheme) private var theme
    @Environment(\.npCitationJump) private var jump
    @Environment(\.dismiss) private var dismiss
    @State private var model: AskModel
    @FocusState private var focused: Bool

    static let starters = [
        "Summarise this in plain words",
        "What's the main result?",
        "Explain the setup step by step",
        "What should I remember for an exam?",
    ]

    public init(documentID: String) {
        self.documentID = documentID
        _model = State(initialValue: AskModel(documentID: documentID))
    }

    public var body: some View {
        VStack(spacing: 0) {
            header
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        intro
                        ForEach(model.items) { item in
                            AskBubble(item: item,
                                      onCitation: { show($0) },
                                      onRetry: { retry(item) })
                                .id(item.id)
                        }
                        if model.sending {
                            TypingIndicator().id("typing")
                        }
                        Color.clear.frame(height: 1).id("end")
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
                .scrollDismissesKeyboard(.interactively)
                .defaultScrollAnchor(.bottom, for: .initialOffset)
                .defaultScrollAnchor(.bottom, for: .sizeChanges)
                .onChange(of: model.items.count) { _, _ in toEnd(proxy) }
                .onChange(of: model.sending) { _, _ in toEnd(proxy) }
                .safeAreaInset(edge: .bottom) { composer }
            }
        }
        .background(theme.surfaceContainer)
        .task {
            await model.load(api: session.api)
            takePendingQuestion()
        }
        .onChange(of: ReaderInbox.shared.questions[documentID]) { _, _ in takePendingQuestion() }
    }

    /// Title and close — drawn here, not in a navigation bar, so it's the
    /// same in the iPad inspector and the iPhone sheet.
    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkles")
                .font(theme.font(.bodySemi, size: 17, relativeTo: .headline))
                .foregroundStyle(theme.accentText)
                .accessibilityHidden(true)
            Text("Ask about this document")
                .font(theme.headline)
                .foregroundStyle(theme.onSurface)
                .lineLimit(2)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            Button {
                nav.askOpen = false
                dismiss()
            } label: {
                Label("Close Ask", systemImage: "xmark")
            }
            .buttonStyle(ReaderIconButtonStyle(boxed: true))
            .keyboardShortcut(.cancelAction)
        }
        .padding(.leading, 16)
        .padding(.trailing, 10)
        .padding(.top, 14)
        .padding(.bottom, 6)
    }

    // MARK: Parts

    private var intro: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let title = model.document?.title {
                Text(title)
                    .font(theme.font(.body, size: 13, relativeTo: .footnote))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .lineLimit(2)
            }
            if !model.canAsk {
                Text("Ask works once this document has finished processing. You can already read it.")
                    .font(theme.bodyFont)
                    .foregroundStyle(theme.onSurfaceVariant)
            } else if let problem = model.loadProblem, model.items.isEmpty {
                Text("Earlier answers couldn't load. \(problem)")
                    .font(theme.bodyFont)
                    .foregroundStyle(theme.onSurfaceVariant)
            } else if model.items.isEmpty, !model.sending {
                Text("Answers come from this document and say which pages they're from. Try one of these, or ask your own.")
                    .font(theme.bodyFont)
                    .foregroundStyle(theme.onSurfaceVariant)
                    .fixedSize(horizontal: false, vertical: true)
                FlowLayout(spacing: 8, lineSpacing: 2) {
                    ForEach(Self.starters, id: \.self) { starter in
                        Button(starter) { send(starter) }
                            .buttonStyle(ReaderChipStyle())
                            .accessibilityLabel("Ask: \(starter)")
                    }
                }
            }
        }
        .padding(.bottom, 4)
    }

    private var canSend: Bool {
        model.canAsk && !model.sending && !model.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var composer: some View {
        let ink = Ink(theme: theme)
        let shape = RoundedRectangle(cornerRadius: theme.isSignal ? ink.controlRadius : 22, style: .continuous)
        return HStack(alignment: .bottom, spacing: 10) {
            TextField("Ask anything about this document…", text: $model.input, axis: .vertical)
                .lineLimit(1...5)
                .font(theme.bodyFont)
                .foregroundStyle(theme.onSurface)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(theme.surfaceHigh, in: shape)
                .overlay(shape.strokeBorder(theme.isSignal ? theme.line : theme.outlineVariant.opacity(0.5),
                                            lineWidth: theme.isSignal ? 1.5 : 0.5))
                .focused($focused)
                .disabled(!model.canAsk)
                .accessibilityLabel("Your question")
            Button { send(model.input) } label: {
                Label("Send question", systemImage: "arrow.up")
            }
            .buttonStyle(ReaderPlayButtonStyle(size: 46))
            .disabled(!canSend)
            .keyboardShortcut(.return, modifiers: .command)
            .accessibilityHint("Command Return also sends")
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(theme.surfaceContainer)
        .overlay(alignment: .top) { theme.line.opacity(0.6).frame(height: 0.5) }
    }

    // MARK: Actions

    private func send(_ text: String) {
        let question = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, model.canAsk, !model.sending else { return }
        model.input = ""
        Task { await model.send(question, api: session.api) }
    }

    private func retry(_ item: AskModel.Item) {
        Task { await model.retry(item, api: session.api) }
    }

    private func show(_ citation: Citation) {
        if let jump {
            jump.perform(citation)
        } else {
            ReaderInbox.shared.citations[documentID] = citation
            nav.open(.reader(documentID: documentID))
        }
    }

    /// A question started from a selection in the reader.
    private func takePendingQuestion() {
        guard model.loaded, let question = ReaderInbox.shared.questions.removeValue(forKey: documentID) else { return }
        if model.canAsk { send(question) } else { model.input = question }
    }

    private func toEnd(_ proxy: ScrollViewProxy) {
        if theme.animates {
            withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("end", anchor: .bottom) }
        } else {
            proxy.scrollTo("end", anchor: .bottom)
        }
    }
}

/// One turn: the question (right), the answer with its sources (left), or
/// a problem with "Try again".
struct AskBubble: View {
    @Environment(\.npTheme) private var theme
    let item: AskModel.Item
    var onCitation: (Citation) -> Void
    var onRetry: () -> Void
    @State private var copied = false

    var body: some View {
        let ink = Ink(theme: theme)
        let shape = RoundedRectangle(cornerRadius: ink.bubbleRadius, style: .continuous)
        switch item.kind {
        case .question:
            HStack {
                Spacer(minLength: 44)
                Text(item.text)
                    .font(theme.font(.bodyMedium, size: 15, relativeTo: .body))
                    .foregroundStyle(theme.onSurface)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(theme.accent.opacity(0.16), in: shape)
                    .overlay(shape.strokeBorder(theme.isSignal ? theme.accentText.opacity(0.5) : .clear, lineWidth: 1.5))
                    .textSelection(.enabled)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("You asked: \(item.text)")
        case .answer:
            VStack(alignment: .leading, spacing: 10) {
                Text(AskText.attributed(item.text))
                    .font(theme.font(.body, size: 15, relativeTo: .body))
                    .foregroundStyle(theme.onSurface)
                    .lineSpacing(3)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                if !item.citations.isEmpty {
                    FlowLayout(spacing: 6, lineSpacing: 0) {
                        ForEach(Array(item.citations.enumerated()), id: \.offset) { index, citation in
                            Button { onCitation(citation) } label: {
                                Label(AskText.citationLabel(citation, index: index), systemImage: "text.magnifyingglass")
                            }
                            .buttonStyle(ReaderChipStyle(tint: theme.tertiary))
                            .accessibilityLabel(AskText.citationSpoken(citation, index: index))
                            .accessibilityHint("Shows this passage in the reader")
                        }
                    }
                }
                HStack {
                    Spacer()
                    Button(action: copy) {
                        Label(copied ? "Copied" : "Copy answer", systemImage: copied ? "checkmark" : "doc.on.doc")
                    }
                    .buttonStyle(ReaderIconButtonStyle(size: 40, boxed: false))
                    .accessibilityLabel(copied ? "Copied" : "Copy answer")
                }
            }
            .padding(14)
            .background(theme.surfaceHigh, in: shape)
            .overlay(shape.strokeBorder(theme.isSignal ? theme.line : .clear, lineWidth: max(1, theme.border)))
            .contextMenu {
                Button(action: copy) { Label("Copy answer", systemImage: "doc.on.doc") }
            }
            .padding(.trailing, 16)
        case .problem(let message):
            VStack(alignment: .leading, spacing: 10) {
                Label {
                    Text(message)
                        .font(theme.font(.body, size: 15, relativeTo: .body))
                        .foregroundStyle(theme.onSurface)
                        .fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "exclamationmark.bubble").foregroundStyle(theme.warn)
                }
                Button("Try again", action: onRetry)
                    .buttonStyle(ReaderChipStyle(selected: true))
            }
            .padding(14)
            .background(theme.warn.opacity(0.12), in: shape)
            .overlay(shape.strokeBorder(theme.warn.opacity(0.5), lineWidth: 1))
            .padding(.trailing, 16)
        }
    }

    private func copy() {
        UIPasteboard.general.string = AskText.plain(item.text)
        copied = true
        AccessibilityNotification.Announcement("Answer copied").post()
        Task {
            try? await Task.sleep(for: .seconds(2))
            copied = false
        }
    }
}

/// "Reading the document…" with three soft dots (still when motion is off).
struct TypingIndicator: View {
    @Environment(\.npTheme) private var theme
    @State private var step = 0

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(theme.accentText)
                        .frame(width: 7, height: 7)
                        .opacity(theme.animates ? (step == i ? 1 : 0.3) : 0.6)
                }
            }
            Text("Reading the document…")
                .font(theme.font(.body, size: 14, relativeTo: .footnote))
                .foregroundStyle(theme.onSurfaceVariant)
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Reading the document")
        .task {
            guard theme.animates else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(420))
                withAnimation(.easeInOut(duration: 0.3)) { step = (step + 1) % 3 }
            }
        }
    }
}
