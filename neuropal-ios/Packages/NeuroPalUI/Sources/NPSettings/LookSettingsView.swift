import NPCore
import NPTheme
import NPTokens
import SwiftUI
import UIKit

/// "Make it yours" — the appearance studio (Expo StudioScreen). Direct edits
/// apply at once; anything Pal proposes (Ask Pal, saved looks) shows in the
/// preview first and only applies on "Apply". Every change can be undone
/// (the last 20, this visit).
struct LookSettingsView: View {
    @Environment(ThemeStore.self) private var store
    @Environment(AppSession.self) private var session
    @Environment(\.npTheme) private var theme

    @State private var history: [StudioPart] = []
    @State private var proposal: Proposal?
    /// A live accent drag (hue slider, colour picker): preview only.
    @State private var draft: Appearance?
    @State private var ask = ""
    @State private var status = ""
    @State private var fineOpen = false
    @State private var hue: Double = 0
    @State private var accentCommit: Task<Void, Never>?
    @FocusState private var askFocused: Bool

    /// Undo covers only what this screen edits; Pal and Home have their own.
    struct StudioPart: Equatable {
        var skin: Appearance.Skin
        var classic: Appearance.Classic
        var signal: Appearance.Signal
    }

    struct Proposal: Equatable {
        var title: String
        var message: String
        var next: Appearance
        var rows: [Tokens.ChangeRow]
    }

    private var current: Appearance { store.appearance }
    private var preview: Appearance { draft ?? proposal?.next ?? current }

    var body: some View {
        GeometryReader { geo in
            if geo.size.width >= 760 {
                // iPad: the preview stays in view beside the controls.
                HStack(alignment: .top, spacing: 0) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            LookPreviewCard(appearance: preview, name: session.user?.name, proposed: proposal != nil || draft != nil)
                            if let proposal { proposalCard(proposal) }
                        }
                        .padding(20)
                    }
                    .frame(width: min(420, geo.size.width * 0.42))
                    .scrollContentBackground(.hidden)
                    form(includePreview: false)
                }
                .background(NPBackground())
            } else {
                form(includePreview: true)
            }
        }
        .navigationTitle("Make it yours")
        .sensoryFeedback(.selection, trigger: studioPart(current))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    undo()
                } label: {
                    Label("Undo", systemImage: "arrow.uturn.backward")
                }
                .disabled(history.isEmpty)
                .accessibilityLabel(history.isEmpty ? "Undo, nothing to undo"
                    : "Undo, \(history.count) \(history.count == 1 ? "step" : "steps") available")
                .keyboardShortcut("z", modifiers: .command)
            }
        }
        .onAppear {
            hue = Double(Tokens.hueOf(current.signal.acc))
            if UIDevice.current.userInterfaceIdiom == .pad { fineOpen = true }
            // Screenshot hook: `-NPSettingsAsk "calm it down"` asks Pal on open.
            if let text = UserDefaults.standard.string(forKey: "NPSettingsAsk"), !text.isEmpty, proposal == nil {
                ask = text
                submitAsk(text)
            }
        }
        .onChange(of: current.signal.acc) { _, acc in
            // A committed accent (swatch, undo, sync) ends any hue preview.
            if draft?.signal.acc != acc { draft = nil }
        }
        .onChange(of: status) { _, text in
            guard !text.isEmpty else { return }
            AccessibilityNotification.Announcement(text).post()
        }
        .onDisappear { accentCommit?.cancel() }
    }

    // MARK: Form

    private func form(includePreview: Bool) -> some View {
        // Side by side (iPad), the HStack draws the one background.
        ScrollViewReader { reader in
            Form {
                if includePreview {
                    Section {
                        LookPreviewCard(appearance: preview, name: session.user?.name, proposed: proposal != nil || draft != nil)
                            .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                            .listRowBackground(Color.clear)
                            .id("preview")
                    }
                    if let proposal {
                        Section { proposalCard(proposal) }
                            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                            .listRowBackground(Color.clear)
                    }
                }
                Section {
                    SkinPicker(skin: current.skin) { skin in edit { $0.skin = skin } }
                        .listRowInsets(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12))
                } header: {
                    FormHeader("Skin")
                }
                .npFormRow()

                if current.skin == .classic {
                    classicSection
                } else {
                    signalSections
                }

                askPalSection
                savedLooksSection
            }
            .npForm(background: includePreview)
            .onChange(of: proposal) { _, p in
                guard p != nil, includePreview else { return }
                // The proposal is judged by looking at the preview.
                if theme.animates {
                    withAnimation { reader.scrollTo("preview", anchor: .top) }
                } else {
                    reader.scrollTo("preview", anchor: .top)
                }
            }
        }
    }

    // MARK: Classic

    private var classicSection: some View {
        let hc = current.classic.theme == "contrast"
        return Section {
            VStack(alignment: .leading, spacing: 10) {
                NPLabel("Theme")
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 8)], spacing: 10) {
                    ForEach(Tokens.tables.classicThemeNames, id: \.self) { t in
                        ClassicThemeTile(theme: t, accent: current.classic.accent, selected: current.classic.theme == t) {
                            edit { $0.classic.theme = t }
                        }
                    }
                }
            }
            .padding(.vertical, 6)
            VStack(alignment: .leading, spacing: 10) {
                if !hc {
                    NPLabel("Accent")
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 8)], spacing: 8) {
                        ForEach(Tokens.tables.classicAccentNames, id: \.self) { a in
                            ClassicAccentPill(theme: current.classic.theme, accent: a, selected: current.classic.accent == a) {
                                edit { $0.classic.accent = a }
                            }
                        }
                    }
                }
                WhyText(hc ? "Contrast uses fixed black, white and yellow, so there are no accents to pick."
                           : "Classic keeps the original 4 themes × 4 accents, unchanged.")
            }
            .padding(.vertical, 6)
        } header: {
            FormHeader("Theme and accent")
        }
        .npFormRow()
    }

    // MARK: Signal

    @ViewBuilder private var signalSections: some View {
        let sig = current.signal
        let preset = Tokens.matchPreset(sig)
        Section {
            VStack(alignment: .leading, spacing: 10) {
                NPFlowLayout(spacing: 8, lineSpacing: 8) {
                    ForEach(Tokens.tables.signalPresets, id: \.name) { p in
                        PresetTile(name: p.name, signal: p.signal, selected: preset == p.name) {
                            edit { $0.signal = p.signal }
                        }
                    }
                }
                WhyText("Presets first, details later (Chernev et al., 2015).")
            }
            .padding(.vertical, 6)
        } header: {
            FormHeader("Start from a vibe", trailing: preset.map { "On: \($0)" } ?? "Custom")
        }
        .npFormRow()

        Section {
            DisclosureGroup(isExpanded: $fineOpen) {
                fineTune(sig)
            } label: {
                Text("Fine-tune · 8 settings")
                    .font(theme.font(.bodyBold, size: 15, relativeTo: .headline))
                    .foregroundStyle(theme.onSurface)
                    .frame(minHeight: 44)
            }
            .tint(theme.onSurface)
        }
        .npFormRow()
    }

    @ViewBuilder private func fineTune(_ sig: Appearance.Signal) -> some View {
        let palette = Tokens.resolveSignalPalette(draft?.signal ?? sig)
        let shownAcc = (draft ?? current).signal.acc
        let autoTint = palette.accentText.uppercased() != palette.accentFill.uppercased()
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                NPLabel("Accent")
                Spacer()
                Text("\(Tokens.accentName(shownAcc).uppercased()) · \(contrastBadge(palette.ratio))")
                    .font(theme.font(.mono, size: 11, relativeTo: .caption))
                    .foregroundStyle(theme.onSurfaceVariant)
            }
            NPFlowLayout(spacing: 6, lineSpacing: 6) {
                ForEach(Tokens.tables.signalAccents, id: \.value) { a in
                    NPSwatch(hex: a.value, selected: sig.acc.uppercased() == a.value, label: "Accent: \(a.name)") {
                        accentCommit?.cancel()
                        draft = nil
                        edit { $0.signal.acc = a.value }
                        hue = Double(Tokens.hueOf(a.value))
                    }
                }
            }
            Text("Any hue · \(shownAcc.uppercased())")
                .font(theme.font(.body, size: 13, relativeTo: .footnote))
                .foregroundStyle(theme.onSurfaceVariant)
            Slider(value: $hue, in: 0...359, step: 1, onEditingChanged: { editing in
                if !editing { commitAccent(Tokens.hslToHex(hue, 1, 0.56), now: true) }
            })
            .tint(Color(token: palette.accentFill))
            .accessibilityLabel("Accent hue")
            .accessibilityValue("\(Int(hue)) degrees, \(Tokens.accentName(shownAcc))")
            .onChange(of: hue) { _, h in
                let hex = Tokens.hslToHex(h, 1, 0.56)
                if hex != current.signal.acc.uppercased() { commitAccent(hex, now: false) }
            }
            ColorPicker(selection: Binding(
                get: { Color(token: shownAcc) },
                set: { color in if let hex = Self.hex(of: color) { commitAccent(hex, now: false) } }),
                supportsOpacity: false) {
                Text("Pick any colour")
                    .font(theme.font(.bodyMedium, size: 15, relativeTo: .body))
                    .foregroundStyle(theme.onSurface)
            }
            .frame(minHeight: 44)
            WhyText(autoTint
                ? "Auto-contrast: text in this colour is tinted lighter or darker so it stays at 4.6:1 or more."
                : "Auto-contrast: this colour already reads at 4.6:1 or more as text.")
            ForEach(Self.fineRows) { row in
                NPChoiceRow(row.label, options: Tokens.tables.options(row.key).map { (value: $0, label: $0) },
                            selection: Self.value(sig, row.key), compact: true) { v in
                    edit { Self.set(&$0.signal, row.key, v) }
                }
            }
            NPChoiceRow("Brutality", options: Tokens.tables.signalBrutalityLevels.map { (value: $0, label: String($0)) },
                        selection: sig.brutality, compact: true) { v in
                edit { $0.signal.brutality = v }
            }
            WhyText("Motion stays in the frame. Reading text, equations and lessons never animate.")
        }
        .padding(.vertical, 8)
    }

    struct FineRow: Identifiable {
        let label: String
        let key: String
        var id: String { key }
    }

    private static let fineRows: [FineRow] = [
        FineRow(label: "Base", key: "base"), FineRow(label: "Motion", key: "motion"),
        FineRow(label: "Background", key: "field"), FineRow(label: "Corners", key: "corners"),
        FineRow(label: "Texture", key: "texture"), FineRow(label: "Type", key: "type"),
    ]

    private static func value(_ s: Appearance.Signal, _ key: String) -> String {
        switch key {
        case "base": return s.base
        case "motion": return s.motion
        case "field": return s.field
        case "corners": return s.corners
        case "texture": return s.texture
        default: return s.type
        }
    }

    private static func set(_ s: inout Appearance.Signal, _ key: String, _ v: String) {
        switch key {
        case "base": s.base = v
        case "motion": s.motion = v
        case "field": s.field = v
        case "corners": s.corners = v
        case "texture": s.texture = v
        default: s.type = v
        }
    }

    // MARK: Ask Pal

    private var askPalSection: some View {
        let examples = current.skin == .signal ? ["Calm it down", "More contrast", "Try orange"]
                                               : ["Warmer", "More contrast", "Make it funky"]
        return Section {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    TextField("less busy, warmer, round corners", text: $ask)
                        .font(theme.font(.body, size: 16, relativeTo: .body))
                        .foregroundStyle(theme.onSurface)
                        .submitLabel(.send)
                        .focused($askFocused)
                        .onSubmit { submitAsk(ask) }
                        .padding(.horizontal, 14)
                        .frame(minHeight: 48)
                        .background(RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 14, style: .continuous)
                            .fill(theme.isSignal ? theme.surfaceLowest.opacity(0.6) : theme.surfaceHigh))
                        .overlay {
                            if theme.isSignal {
                                RoundedRectangle(cornerRadius: theme.radiusControl, style: .continuous)
                                    .strokeBorder(theme.control, lineWidth: 1.5)
                            }
                        }
                        .accessibilityLabel("Describe a change in your own words")
                    NPIconButton("arrow.up", label: "Ask Pal", filled: true) { submitAsk(ask) }
                        .disabled(ask.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                NPFlowLayout(spacing: 6, lineSpacing: 6) {
                    ForEach(examples, id: \.self) { e in
                        NPChip(e) {
                            ask = e
                            submitAsk(e)
                        }
                    }
                }
                if !status.isEmpty {
                    Text(status)
                        .font(theme.font(.body, size: 14, relativeTo: .callout))
                        .foregroundStyle(theme.onSurfaceVariant)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, 6)
        } header: {
            FormHeader("Ask Pal", trailing: "Preview · apply · undo")
        }
        .npFormRow()
    }

    // MARK: Saved looks

    private var savedLooksSection: some View {
        let look = Tokens.matchLook(current)
        return Section {
            VStack(alignment: .leading, spacing: 10) {
                NPFlowLayout(spacing: 6, lineSpacing: 6) {
                    ForEach(Tokens.lookNames(current.skin), id: \.self) { l in
                        NPChip(l, selected: look == l, accessibilityLabel: "Saved look: \(l)") {
                            let desc = Tokens.lookDescription(current.skin, l)
                            propose(Tokens.applyLook(current, l), title: "Switch to \(l)?",
                                    message: "\(l): \(desc) Check the preview, then apply.")
                        }
                    }
                }
            }
            .padding(.vertical, 6)
            Toggle(isOn: Binding(get: { current.suggestLooks }, set: { v in store.update { $0.suggestLooks = v } })) {
                Text("Pal may suggest a look when your state changes. It always asks first.")
                    .font(theme.font(.body, size: 14, relativeTo: .callout))
                    .foregroundStyle(theme.onSurface)
            }
            .npToggleTint()
            .frame(minHeight: 44)
        } header: {
            FormHeader("Saved looks", trailing: look.map { "On: \($0)" } ?? "Custom")
        }
        .npFormRow()
    }

    // MARK: Proposal

    private func proposalCard(_ p: Proposal) -> some View {
        NPCard(padding: 14, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                PalFigure(pal: current.pal, size: 40).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(p.title)
                        .font(theme.font(.displaySemi, size: 17, relativeTo: .headline))
                        .foregroundStyle(theme.onSurface)
                        .accessibilityAddTraits(.isHeader)
                    Text(p.message)
                        .font(theme.font(.body, size: 14, relativeTo: .callout))
                        .foregroundStyle(theme.onSurfaceVariant)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            VStack(spacing: 0) {
                ForEach(p.rows) { row in
                    ChangeRowView(row: row)
                }
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { proposalButtons }
                VStack(alignment: .leading, spacing: 10) { proposalButtons }
            }
            WhyText("The preview shows this first, and Undo can reverse it (Sreedhar et al., 2026).")
        }
        .padding(.horizontal, 2)
    }

    @ViewBuilder private var proposalButtons: some View {
        Button {
            applyProposal()
        } label: {
            NPButtonLabel("Apply", systemImage: "checkmark")
        }
        .buttonStyle(.npPrimary)
        Button("Not now") {
            proposal = nil
            status = "Kept your current look."
        }
        .buttonStyle(.npSecondary)
    }

    // MARK: Actions

    private func studioPart(_ a: Appearance) -> StudioPart {
        StudioPart(skin: a.skin, classic: a.classic, signal: a.signal)
    }

    private func commit(_ next: Appearance) {
        history = Array((history + [studioPart(current)]).suffix(20))
        store.apply(next)
    }

    private func edit(_ change: (inout Appearance) -> Void) {
        var next = current
        change(&next)
        guard next != current else { return }
        proposal = nil
        commit(next)
    }

    private func undo() {
        guard let prev = history.last else { return }
        history.removeLast()
        proposal = nil
        draft = nil
        var a = current
        a.skin = prev.skin
        a.classic = prev.classic
        a.signal = prev.signal
        store.apply(a)
        hue = Double(Tokens.hueOf(a.signal.acc))
        status = "Undone."
    }

    private func propose(_ next: Appearance, title: String, message: String) {
        let rows = Tokens.diffAppearance(current, next)
        guard !rows.isEmpty else {
            proposal = nil
            status = "That’s already your look."
            return
        }
        proposal = Proposal(title: title, message: message, next: next, rows: rows)
        status = "Pal suggested \(rows.count) \(rows.count == 1 ? "change" : "changes"). Check the preview."
    }

    private func submitAsk(_ text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        switch Tokens.interpretAppearance(t, current) {
        case .failure(let refusal):
            proposal = nil
            status = "Pal: \(refusal.message)"
        case .success(let p):
            askFocused = false
            propose(p.next, title: "Pal suggests", message: "Here’s how I read “\(t)”. Nothing changes until you apply it.")
        }
    }

    private func applyProposal() {
        guard let p = proposal else { return }
        commit(p.next)
        proposal = nil
        ask = ""
        status = "Applied. Undo is at the top if you change your mind."
        hue = Double(Tokens.hueOf(p.next.signal.acc))
    }

    /// Accent drags preview at once and commit after a short pause (screen
    /// readers adjust a slider without ever "releasing" it).
    private func commitAccent(_ hex: String, now: Bool) {
        var d = current
        d.signal.acc = hex
        draft = d
        accentCommit?.cancel()
        if now {
            edit { $0.signal.acc = hex }
            return
        }
        accentCommit = Task {
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            edit { $0.signal.acc = hex }
        }
    }

    static func hex(of color: Color) -> String? {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
        func c(_ v: CGFloat) -> Int { Int((min(1, max(0, v)) * 255).rounded()) }
        return Tokens.rgbToHex(Tokens.RGB(c(r), c(g), c(b)))
    }
}

/// "Motion   Lively → Calm"
struct ChangeRowView: View {
    @Environment(\.npTheme) private var theme
    let row: Tokens.ChangeRow

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(theme.outlineVariant.opacity(0.5)).frame(height: 1)
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    NPLabel(row.k, color: theme.onSurfaceVariant).frame(width: 104, alignment: .leading)
                    change
                    Spacer(minLength: 0)
                }
                VStack(alignment: .leading, spacing: 2) {
                    NPLabel(row.k, color: theme.onSurfaceVariant)
                    change
                }
            }
            .padding(.vertical, 7)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(row.k): from \(row.from) to \(row.to)")
    }

    private var change: some View {
        (Text("\(row.from) → ").font(theme.font(.mono, size: 13, relativeTo: .subheadline)).foregroundStyle(theme.onSurfaceVariant)
            + Text(row.to).font(theme.font(.bodyBold, size: 14, relativeTo: .subheadline)).foregroundStyle(theme.onSurface))
            .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Pieces

/// Classic or Signal, as two cards (a radio group).
struct SkinPicker: View {
    @Environment(\.npTheme) private var theme
    @Environment(\.dynamicTypeSize) private var typeSize
    let skin: Appearance.Skin
    let onPick: (Appearance.Skin) -> Void

    struct Option: Identifiable {
        let skin: Appearance.Skin
        let name: String
        let desc: String
        var id: String { name }
    }

    private static let skins: [Option] = [
        Option(skin: .classic, name: "Classic", desc: "Calm glass · the original presets"),
        Option(skin: .signal, name: "Signal", desc: "Brutal glass · make it yours"),
    ]

    var body: some View {
        // Side by side (descriptions wrap); stacked at accessibility sizes.
        if typeSize.isAccessibilitySize {
            VStack(spacing: 12) { cards }
        } else {
            HStack(alignment: .top, spacing: 12) { cards }
        }
    }

    @ViewBuilder private var cards: some View {
        ForEach(Self.skins) { option in
            let s = option.skin
            let name = option.name
            let desc = option.desc
            let on = skin == s
            let solid = on && theme.isSignal
            let fg = solid ? theme.accentInk : theme.onSurface
            let r = theme.isSignal ? theme.radiusMedium : 18
            let shape = RoundedRectangle(cornerRadius: r, style: .continuous)
            Button {
                if !on { onPick(s) }
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(name)
                            .font(theme.isSignal ? theme.font(.display, size: 19, relativeTo: .title3)
                                                 : theme.font(.displaySemi, size: 17, relativeTo: .headline))
                            .foregroundStyle(fg)
                        Spacer(minLength: 4)
                        if on {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(solid ? theme.accentInk : theme.accentText)
                        }
                    }
                    Text(desc)
                        .font(theme.font(.body, size: 13, relativeTo: .footnote))
                        .foregroundStyle(solid ? theme.accentInk : theme.onSurfaceVariant)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(12)
                .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
                .background(shape.fill(solid ? theme.accentFill : (on ? theme.accentText.opacity(0.12) : Color.clear)))
                .overlay(shape.strokeBorder(solid ? theme.shadowColor : (on ? theme.accentText : (theme.isSignal ? theme.control : theme.outline.opacity(0.5))),
                                            lineWidth: on ? 2 : 1.5))
                .background { if solid && theme.shadow > 0 { shape.fill(theme.shadowColor).offset(x: theme.shadow, y: theme.shadow) } }
                .contentShape(shape)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(name) skin. \(desc)")
            .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
        }
    }
}

/// A Classic theme as a little page: "Aa" and its accent dot on its surface.
struct ClassicThemeTile: View {
    @Environment(\.npTheme) private var theme
    let theme_: String
    let accent: String
    let selected: Bool
    let action: () -> Void

    init(theme: String, accent: String, selected: Bool, action: @escaping () -> Void) {
        self.theme_ = theme
        self.accent = accent
        self.selected = selected
        self.action = action
    }

    var body: some View {
        let q = Tokens.resolveClassicPalette(theme: theme_, accent: accent)
        let name = theme_.prefix(1).uppercased() + theme_.dropFirst()
        Button(action: action) {
            VStack(spacing: 5) {
                HStack(spacing: 6) {
                    Text("Aa")
                        .font(theme.font(.displaySemi, size: 18, relativeTo: .headline))
                        .foregroundStyle(Color(token: q.onSurface))
                    Circle().fill(Color(token: q.accent)).frame(width: 8, height: 8)
                }
                .frame(maxWidth: .infinity, minHeight: 58)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(token: q.surface)))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(selected ? theme.accentText : Color(token: q.outlineVariant), lineWidth: selected ? 2.5 : 1))
                HStack(spacing: 3) {
                    if selected { Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(theme.accentText) }
                    Text(name)
                        .font(theme.font(.bodySemi, size: 13, relativeTo: .footnote))
                        .foregroundStyle(theme.onSurface)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name) theme")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// A Classic accent as a pill with its colour dot (off in Contrast).
struct ClassicAccentPill: View {
    @Environment(\.npTheme) private var theme
    @Environment(\.isEnabled) private var isEnabled
    let theme_: String
    let accent: String
    let selected: Bool
    let action: () -> Void

    init(theme: String, accent: String, selected: Bool, action: @escaping () -> Void) {
        self.theme_ = theme
        self.accent = accent
        self.selected = selected
        self.action = action
    }

    var body: some View {
        let q = Tokens.resolveClassicPalette(theme: theme_, accent: accent)
        let name = accent.prefix(1).uppercased() + accent.dropFirst()
        Button(action: action) {
            HStack(spacing: 7) {
                Circle().fill(Color(token: q.accent)).frame(width: 18, height: 18)
                    .overlay(Circle().strokeBorder(theme.onSurface.opacity(0.2), lineWidth: 1))
                Text(name)
                    .font(theme.font(.bodySemi, size: 14, relativeTo: .subheadline))
                    .foregroundStyle(theme.onSurface)
                if selected { Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(theme.accentText) }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 44)
            .overlay(Capsule().strokeBorder(selected ? theme.accentText : theme.outline.opacity(0.45), lineWidth: selected ? 2 : 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .opacity(isEnabled ? 1 : 0.42)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(isEnabled ? "\(name) accent" : "\(name) accent, not available in Contrast")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// A Signal preset as a thumbnail of its look.
struct PresetTile: View {
    @Environment(\.npTheme) private var theme
    let name: String
    let signal: Appearance.Signal
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let p = Tokens.resolveSignalPalette(signal)
        let sh = max(2, min(4, p.shape.shadow))
        let r = (p.shape.radius * 0.4).rounded()
        let inner = (r * 0.6).rounded()
        Button(action: action) {
            VStack(spacing: 5) {
                VStack(alignment: .leading, spacing: 0) {
                    RoundedRectangle(cornerRadius: inner, style: .continuous)
                        .fill(Color(token: p.surfaceContainer))
                        .overlay(RoundedRectangle(cornerRadius: inner, style: .continuous).strokeBorder(Color(token: p.line), lineWidth: 1))
                        .background(RoundedRectangle(cornerRadius: inner, style: .continuous).fill(Color(token: p.shadowColor)).offset(x: sh, y: sh))
                        .frame(width: 38, height: 16)
                    Spacer(minLength: 0)
                    RoundedRectangle(cornerRadius: 1).fill(Color(token: p.accentFill)).frame(height: 5)
                }
                .padding(7)
                .frame(width: 70, height: 50)
                .background(RoundedRectangle(cornerRadius: r, style: .continuous).fill(Color(token: p.surface)))
                .overlay(RoundedRectangle(cornerRadius: r, style: .continuous).strokeBorder(Color(token: p.line), lineWidth: 1.5))
                HStack(spacing: 3) {
                    if selected { Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(theme.accentText) }
                    Text(name)
                        .font(theme.font(.bodySemi, size: 12, relativeTo: .caption))
                        .foregroundStyle(theme.onSurface)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(width: 70)
            }
            .padding(4)
            .overlay(RoundedRectangle(cornerRadius: max(4, theme.radius * 0.5), style: .continuous)
                .strokeBorder(selected ? theme.accentText : Color.clear, lineWidth: 2))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name) preset: \(signal.base) base, \(Tokens.accentName(signal.acc)) accent, \(signal.motion.lowercased()) motion")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}
