import NPCore
import NPDay
import NPTheme
import SwiftUI

/// Pal's assistant (components/pal/PalSheet.jsx): What now? · Break it
/// down · Brain dump · Sit with me · Talk. Everything but Talk works
/// offline. Shown as a sheet from anywhere (with detents on iPhone) and as
/// the Pal tab, where the same view fills the page.
public struct PalAssistantView: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @Environment(AppNavigator.self) private var nav
    @Environment(AppPreferences.self) private var prefs
    @Environment(\.isPresented) private var isPresented
    @Environment(\.dismiss) private var dismiss

    public let initialTool: PalTool?
    @State private var tool: PalTool = .whatNow
    @State private var started = false
    @State private var breakdown = BreakdownModel()

    public init(initialTool: PalTool? = nil) { self.initialTool = initialTool }

    private var pal: Appearance.Pal { theme.appearance.pal }

    public var body: some View {
        VStack(spacing: 0) {
            header
            ToolBar(tool: $tool)
                .padding(.top, 10)
            Rectangle().fill(theme.outlineVariant.opacity(0.5)).frame(height: 1).padding(.top, 8)
            Group {
                switch tool {
                case .talk:
                    TalkPanel(onCalm: openCalm)
                default:
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            switch tool {
                            case .whatNow: WhatNowPanel(show: { tool = $0 }, openCalm: openCalm, openReader: openReader)
                            case .breakdown: BreakdownPanel(model: breakdown, onSit: { tool = .sit })
                            case .dump: DumpPanel()
                            case .sit: SitPanel()
                            case .talk: EmptyView()
                            }
                        }
                        .padding(.horizontal, 18)
                        .padding(.top, 14)
                        .padding(.bottom, 28)
                        .frame(maxWidth: 680, alignment: .leading)
                        .frame(maxWidth: .infinity)
                    }
                    .scrollDismissesKeyboard(.interactively)
                }
            }
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .background((isPresented ? theme.surfaceContainer : theme.surface).ignoresSafeArea())
        .onAppear {
            day.pal = pal
            if !started {
                started = true
                tool = initialTool ?? (day.day.sit != nil ? .sit : .whatNow)
                if let task = launchTask() { breakdown.task = task; tool = .breakdown }
            }
        }
        .onChange(of: initialTool) { _, t in if let t { tool = t } }
        .onChange(of: pal) { _, p in day.pal = p }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(pal.name), your assistant")
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .center, spacing: 8) {
            PalAvatar(pal: pal, palette: theme.palette, mood: PalMood(day.day.state), size: 58, motion: theme.motionLevel)
            VStack(alignment: .leading, spacing: 1) {
                if theme.isSignal {
                    Text("PAL · YOUR ASSISTANT")
                        .font(theme.font(.label, size: 11, relativeTo: .caption))
                        .tracking(1.6)
                        .foregroundStyle(theme.outline)
                }
                Text(pal.name)
                    .font(theme.font(theme.isSignal ? .display : .displaySemi, size: theme.isSignal ? 21 : 19, relativeTo: .title3))
                    .foregroundStyle(theme.onSurface)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
                Text(PalLogic.hello(pal, state: day.day.state))
                    .font(theme.font(.body, size: 13.5, relativeTo: .subheadline))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 4)
            Menu {
                if UIDevice.current.userInterfaceIdiom == .phone {
                    Button {
                        prefs.palBubbleHidden.toggle()
                    } label: {
                        Label(prefs.palBubbleHidden ? "Show the bubble" : "Hide the bubble",
                              systemImage: prefs.palBubbleHidden ? "eye" : "eye.slash")
                    }
                }
                Button {
                    close()
                    nav.open(.tab(.settings))
                } label: {
                    Label("Change how \(pal.name) looks and talks", systemImage: "face.smiling")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.system(size: 20, weight: .regular))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("More for \(pal.name)")
            if isPresented {
                Button {
                    close()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(theme.onSurfaceVariant)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close \(pal.name)")
                .keyboardShortcut(.cancelAction)
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 6)
        .padding(.top, 12)
    }

    // MARK: Leaving the sheet

    private func close() {
        if nav.palOpen { nav.palOpen = false } else if isPresented { dismiss() }
    }

    private func openCalm() {
        nav.open(.calm)
    }

    private func openReader(_ id: String) {
        nav.palOpen = false
        nav.open(.reader(documentID: id))
    }

    /// Mock screenshots only: -NPPalTask "…" fills Break it down and runs it.
    private func launchTask() -> String? {
        guard !day.isPersistent, let t = UserDefaults.standard.string(forKey: "NPPalTask"), !t.isEmpty else { return nil }
        return t
    }
}

/// The tools as a segmented header: each a labelled chip, the current one
/// filled. Scrolls sideways when the text is large.
private struct ToolBar: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @Binding var tool: PalTool

    static func symbol(_ t: PalTool) -> String {
        switch t {
        case .whatNow: return "arrow.right.circle"
        case .breakdown: return "arrow.triangle.branch"
        case .dump: return "tray.and.arrow.down"
        case .sit: return "figure.mind.and.body"
        case .talk: return "bubble.left"
        }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(PalTool.allCases, id: \.self) { t in
                        let on = tool == t
                        Button {
                            tool = t
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: Self.symbol(t)).font(.system(size: 14, weight: .semibold))
                                Text(t.title).font(theme.font(theme.isSignal ? .bodyBold : .bodySemi, size: 13.5,
                                                              relativeTo: .subheadline))
                                if t == .sit, let sit = day.day.sit, sit.isRunning {
                                    Circle().fill(on ? theme.accentInk : theme.accentText).frame(width: 7, height: 7)
                                        .accessibilityHidden(true)
                                }
                            }
                            .foregroundStyle(on ? (theme.isSignal ? theme.accentInk : theme.accentText) : theme.onSurface)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 44)
                            .background(on ? (theme.isSignal ? theme.accentFill : theme.accent.opacity(0.16)) : Color.clear,
                                        in: RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 22,
                                                             style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 22, style: .continuous)
                                .strokeBorder(on ? (theme.isSignal ? theme.shadowColor : theme.accent.opacity(0.6))
                                              : (theme.isSignal ? theme.control : theme.outline.opacity(0.5)), lineWidth: 1.5))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .id(t)
                        .accessibilityLabel(t == .sit && day.day.sit?.isRunning == true ? "\(t.title), running" : t.title)
                        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                        .hoverEffect(.highlight)
                    }
                }
                .padding(.horizontal, 14)
            }
            .onChange(of: tool) { _, t in
                withAnimation(theme.animates ? .easeInOut(duration: 0.2) : nil) { proxy.scrollTo(t, anchor: .center) }
            }
            .onAppear { proxy.scrollTo(tool, anchor: .center) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Pal’s tools")
    }
}

#Preview("Pal · Classic") {
    PalPreview(theme: .classic) { PalAssistantView(initialTool: .whatNow) }
}

#Preview("Pal · Signal · Talk") {
    PalPreview(theme: .signal) { PalAssistantView(initialTool: .talk) }
}

/// The environment Pal's previews need, all in memory.
struct PalPreview<Content: View>: View {
    let theme: NPTheme
    @ViewBuilder var content: Content
    @State private var session = AppSession(
        store: MemorySessionStore(StoredSession(host: "https://mock.neuropal.invalid", token: "mock-token", user: MockFixtures.user)),
        makeAPI: { host in MockNeuroPalAPI(host: host, latency: .zero) })
    @State private var nav = AppNavigator()
    @State private var day = DayStore(persist: false)
    @State private var themeStore = ThemeStore(persist: false)
    @State private var prefs = AppPreferences(defaults: nil)

    var body: some View {
        content
            .environment(session)
            .environment(nav)
            .environment(day)
            .environment(themeStore)
            .environment(prefs)
            .npTheme(theme)
    }
}
