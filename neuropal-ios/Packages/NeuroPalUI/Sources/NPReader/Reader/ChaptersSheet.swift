import NPTheme
import SwiftUI

/// Contents: the document's chapters (with page and listening time) and its
/// real pages. Tapping one moves the reading position there.
struct ChaptersSheet: View {
    @Environment(\.npTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    let text: ReadingText
    let cursor: Int
    let wordsPerMinute: Double
    var onChapter: (Int) -> Void
    var onPage: (Int) -> Void

    private var current: Int? { text.chapterIndex(forWord: cursor) }
    private var currentPage: Int? { text.page(forWord: cursor) }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                List {
                    if text.chapters.isEmpty && text.pages.isEmpty {
                        Text("This document has no chapters or page numbers. Scroll, or use the sentence and paragraph buttons to move around.")
                            .font(theme.bodyFont)
                            .foregroundStyle(theme.onSurfaceVariant)
                            .listRowBackground(theme.surfaceHigh)
                    }
                    if !text.chapters.isEmpty {
                        Section {
                            ForEach(Array(text.chapters.enumerated()), id: \.element.id) { index, chapter in
                                chapterRow(index, chapter).id("chapter-\(index)")
                            }
                        } header: {
                            SkinLabel("Chapters")
                        }
                    }
                    if !text.pages.isEmpty {
                        Section {
                            ForEach(text.pages, id: \.page) { mark in
                                pageRow(mark.page).id("page-\(mark.page)")
                            }
                        } header: {
                            SkinLabel("Pages")
                        }
                    }
                }
                .scrollContentBackground(.hidden)
                .background(theme.surfaceContainer)
                .onAppear {
                    // Long contents open at the current chapter; short ones stay at the top.
                    if let current, text.chapters.count > 8 { proxy.scrollTo("chapter-\(current)", anchor: .center) }
                }
            }
            .navigationTitle("Contents")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func chapterRow(_ index: Int, _ chapter: ReadingText.Chapter) -> some View {
        let range = text.wordRange(ofChapter: index)
        let isCurrent = index == current
        let time = ReaderCopy.listeningTime(words: range.count, wpm: wordsPerMinute)
        return Button {
            onChapter(index)
            dismiss()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: isCurrent ? "bookmark.fill" : "circle")
                    .font(theme.font(.bodySemi, size: isCurrent ? 15 : 7, relativeTo: .footnote))
                    .foregroundStyle(isCurrent ? theme.accentText : theme.outline)
                    .frame(width: 20)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(chapter.title)
                        .font(theme.font(isCurrent ? .bodySemi : .body, size: 16, relativeTo: .body))
                        .foregroundStyle(isCurrent ? theme.accentText : theme.onSurface)
                        .multilineTextAlignment(.leading)
                    if isCurrent {
                        Text("You're here")
                            .font(theme.font(.body, size: 12, relativeTo: .caption))
                            .foregroundStyle(theme.onSurfaceVariant)
                    }
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 3) {
                    if let page = chapter.page {
                        Text("p. \(page)")
                            .font(theme.font(.mono, size: 12, relativeTo: .caption))
                            .foregroundStyle(theme.onSurfaceVariant)
                    }
                    Text(time)
                        .font(theme.font(.mono, size: 12, relativeTo: .caption))
                        .foregroundStyle(theme.onSurfaceVariant)
                }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(isCurrent ? theme.accent.opacity(0.12) : theme.surfaceHigh)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(chapterLabel(chapter, range: range, isCurrent: isCurrent))
        .accessibilityAddTraits(isCurrent ? [.isButton, .isSelected] : .isButton)
    }

    private func chapterLabel(_ chapter: ReadingText.Chapter, range: Range<Int>, isCurrent: Bool) -> String {
        var parts = [chapter.title]
        if let page = chapter.page { parts.append("page \(page)") }
        parts.append(ReaderCopy.listeningTimeSpoken(words: range.count, wpm: wordsPerMinute))
        if isCurrent { parts.append("you're here") }
        return parts.joined(separator: ", ")
    }

    private func pageRow(_ page: Int) -> some View {
        let isCurrent = page == currentPage
        return Button {
            onPage(page)
            dismiss()
        } label: {
            HStack {
                Text("Page \(page)")
                    .font(theme.font(isCurrent ? .bodySemi : .body, size: 16, relativeTo: .body))
                    .foregroundStyle(isCurrent ? theme.accentText : theme.onSurface)
                Spacer()
                if isCurrent {
                    Text("You're here")
                        .font(theme.font(.body, size: 12, relativeTo: .caption))
                        .foregroundStyle(theme.onSurfaceVariant)
                }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(isCurrent ? theme.accent.opacity(0.12) : theme.surfaceHigh)
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
    }
}
