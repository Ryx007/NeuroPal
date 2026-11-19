import NPCore
import NPTheme
import SwiftUI

/// The original pages of a pdf/arxiv document, rendered by the server
/// (GET /page/:n, with a document ticket because an image load can't send
/// the session header). Pages load lazily as they scroll into view.
struct PagesView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.npTheme) private var theme
    let documentID: String
    let pageCount: Int
    @Binding var page: Int
    var bottomInset: CGFloat

    @State private var ticket: String?
    @State private var ready = false
    @State private var visible: Int?
    /// Until the reading page is shown, scroll positions are layout noise.
    @State private var positioned = false

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 20) {
                ForEach(1...max(1, pageCount), id: \.self) { n in
                    PageImage(url: ready ? session.api.pageImageURL(documentID: documentID, page: n, ticket: ticket) : nil,
                              number: n, count: pageCount)
                        .id(n)
                }
            }
            .scrollTargetLayout()
            .frame(maxWidth: 860)
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, bottomInset)
            .frame(maxWidth: .infinity)
        }
        .scrollPosition(id: $visible, anchor: .top)
        .onChange(of: visible) { _, now in
            if positioned, let now, now != page { page = now }
        }
        .onChange(of: page) { _, now in
            if visible != now { visible = now }
        }
        .task(id: documentID) {
            ticket = try? await session.api.ticket(documentID: documentID).ticket
            ready = true
            visible = page
            positioned = true
        }
    }
}

/// One page image with a calm placeholder.
struct PageImage: View {
    @Environment(\.npTheme) private var theme
    let url: URL?
    let number: Int
    let count: Int

    var body: some View {
        VStack(spacing: 8) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFit()
                case .failure:
                    placeholder(loading: false)
                case .empty:
                    placeholder(loading: url != nil)
                @unknown default:
                    placeholder(loading: false)
                }
            }
            .aspectRatio(0.773, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(theme.line, lineWidth: 0.5))
            Text("\(number) / \(count)")
                .font(theme.font(.mono, size: 11, relativeTo: .caption2))
                .foregroundStyle(theme.onSurfaceVariant)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Page \(number) of \(count)")
        .accessibilityAddTraits(.isImage)
    }

    private func placeholder(loading: Bool) -> some View {
        ZStack {
            theme.surfaceContainer
            VStack(spacing: 10) {
                if loading {
                    ProgressView().tint(theme.accentText)
                } else {
                    Image(systemName: "doc.richtext")
                        .font(theme.font(.bodySemi, size: 28, relativeTo: .title))
                        .foregroundStyle(theme.outline)
                    Text("Page image not available offline")
                        .font(theme.font(.body, size: 14, relativeTo: .footnote))
                        .foregroundStyle(theme.onSurfaceVariant)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }
            }
        }
    }
}
