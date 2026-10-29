import NPCore
import NPTheme
import SwiftUI

/// One library row: type badge, title, subtitle, and either reading
/// progress, the ingest stage, or what went wrong — read by VoiceOver as
/// one element ("Correlation plenoptic imaging…, PDF, 42 percent read").
struct DocumentRow: View {
    @Environment(\.npTheme) private var theme
    let document: NPDocument
    var selected = false

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            TypeBadge(type: document.type)
            VStack(alignment: .leading, spacing: 6) {
                Text(document.title)
                    .font(theme.font(.displaySemi, size: 17, relativeTo: .headline))
                    .foregroundStyle(theme.onSurface)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                if let subtitle = document.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(theme.font(.body, size: 13, relativeTo: .subheadline))
                        .foregroundStyle(theme.onSurfaceVariant)
                        .lineLimit(2)
                }
                status
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .readerCard(selected: selected)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenLabel)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    @ViewBuilder
    private var status: some View {
        if document.status == .failed {
            Label {
                Text("Couldn't read this file: \(document.failureText)")
                    .font(theme.font(.body, size: 13, relativeTo: .footnote))
                    .foregroundStyle(theme.onSurface)
                    .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(theme.error)
            }
        } else if document.status.isProcessing {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: "hourglass")
                        .foregroundStyle(theme.accentText)
                        .accessibilityHidden(true)
                    Text(processingText)
                        .font(theme.font(.bodyMedium, size: 13, relativeTo: .footnote))
                        .foregroundStyle(theme.onSurfaceVariant)
                }
                ProgressTrack(fraction: ingestFraction, height: 4, tint: theme.accentFill)
            }
        } else {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Text(readingText)
                        .font(theme.font(.bodyMedium, size: 12, relativeTo: .caption))
                        .foregroundStyle(theme.onSurfaceVariant)
                    Spacer(minLength: 4)
                    if let pages = document.pageCount, pages > 0 {
                        Text("\(pages) pp")
                            .font(theme.font(.mono, size: 12, relativeTo: .caption))
                            .foregroundStyle(theme.onSurfaceVariant)
                    }
                }
                ProgressTrack(fraction: document.readFraction, height: 4, tint: TypeBadge.tint(document.type, theme))
            }
        }
    }

    /// Indexing shows its own percentage; the earlier stages show their step.
    private var ingestFraction: Double {
        if document.status == .embedding { return min(1, max(0.02, document.progress ?? 0)) }
        return max(0.04, Double((document.status.step ?? 1) - 1) / 4)
    }

    private var processingText: String {
        if document.status == .embedding, let p = document.progress {
            return "\(document.status.stageText) · \(ReaderCopy.percent(p))%"
        }
        return document.status.stageText
    }

    private var readingText: String {
        let f = document.readFraction
        if f >= 0.995 { return "Finished" }
        if f > 0 { return "\(ReaderCopy.percent(f))% read" }
        return "Not started"
    }

    private var spokenLabel: String {
        var parts = [document.title]
        if let subtitle = document.subtitle, !subtitle.isEmpty { parts.append(subtitle) }
        parts.append(document.type.spokenName)
        if document.status == .failed {
            parts.append("couldn't read this file: \(document.failureText)")
        } else if document.status.isProcessing {
            var stage = "processing: \(document.status.stageText.lowercased())"
            if document.status == .embedding, let p = document.progress { stage += ", \(ReaderCopy.percent(p)) percent" }
            parts.append(stage)
        } else {
            let f = document.readFraction
            parts.append(f >= 0.995 ? "finished" : f > 0 ? "\(ReaderCopy.percent(f)) percent read" : "not started")
        }
        return parts.joined(separator: ", ")
    }
}

/// The document type: an icon on a tinted square and a short label.
struct TypeBadge: View {
    @Environment(\.npTheme) private var theme
    let type: DocumentType

    static func tint(_ type: DocumentType, _ theme: NPTheme) -> Color {
        switch type.rawValue {
        case "pdf", "djvu": return theme.primary
        case "epub", "arxiv": return theme.secondary
        case "docx", "pptx", "md": return theme.tertiary
        default: return theme.onSurfaceVariant
        }
    }

    var body: some View {
        let tint = Self.tint(type, theme)
        let shape = RoundedRectangle(cornerRadius: theme.isSignal ? max(4, theme.radiusMedium - 4) : 14, style: .continuous)
        VStack(spacing: 4) {
            Image(systemName: type.symbol)
                .font(theme.font(.bodySemi, size: 20, relativeTo: .title3))
                .foregroundStyle(tint)
            Text(type.label.uppercased())
                .font(theme.font(.label, size: 9, relativeTo: .caption2))
                .tracking(0.8)
                .foregroundStyle(theme.onSurfaceVariant)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(width: 54, height: 58)
        .background(tint.opacity(0.13), in: shape)
        .overlay(shape.strokeBorder(theme.isSignal ? tint.opacity(0.6) : .clear, lineWidth: 1.5))
        .accessibilityHidden(true)
    }
}

/// A file being added: spinner while it goes up, the reason when it doesn't.
struct UploadRow: View {
    @Environment(\.npTheme) private var theme
    let job: UploadJob
    var onRetry: () -> Void
    var onDismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(theme.accent.opacity(0.13))
                if case .failed = job.state {
                    Image(systemName: "exclamationmark.icloud").foregroundStyle(theme.warn)
                } else {
                    ProgressView().tint(theme.accentText)
                }
            }
            .frame(width: 54, height: 58)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(job.name)
                    .font(theme.font(.bodySemi, size: 16, relativeTo: .headline))
                    .foregroundStyle(theme.onSurface)
                    .lineLimit(2)
                switch job.state {
                case .preparing, .uploading:
                    Text(job.state == .preparing ? "Getting the file ready…" : "Uploading…")
                        .font(theme.font(.body, size: 13, relativeTo: .footnote))
                        .foregroundStyle(theme.onSurfaceVariant)
                case .failed(let reason):
                    Text("Couldn't add it. \(reason)")
                        .font(theme.font(.body, size: 13, relativeTo: .footnote))
                        .foregroundStyle(theme.onSurface)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        Button("Try again", action: onRetry)
                            .buttonStyle(ReaderChipStyle(selected: true))
                        Button("Dismiss", action: onDismiss)
                            .buttonStyle(ReaderChipStyle())
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .readerCard()
        .accessibilityElement(children: .contain)
        .accessibilityLabel(spoken)
    }

    private var spoken: String {
        switch job.state {
        case .preparing, .uploading: return "Adding \(job.name)"
        case .failed(let reason): return "Couldn't add \(job.name). \(reason)"
        }
    }
}
