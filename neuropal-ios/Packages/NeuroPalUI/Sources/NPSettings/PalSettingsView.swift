import NPDay
import NPTheme
import NPTokens
import SwiftUI

/// Pal: name, how Pal talks, Pal's voice, people, the bubble, Pal's look
/// (Expo PalBuilderScreen + Settings' bubble switch). Every pick saves at
/// once and syncs with the rest of the appearance.
struct PalSettingsView: View {
    @Environment(ThemeStore.self) private var store
    @Environment(AppPreferences.self) private var prefs
    @Environment(\.npTheme) private var theme
    @State private var nameDraft = ""
    @State private var lookOpen = false
    @State private var speech = SpeechSampler()
    @FocusState private var nameFocused: Bool

    private var pal: Appearance.Pal { store.appearance.pal }

    var body: some View {
        @Bindable var prefs = prefs
        Form {
            Section {
                HStack(alignment: .center, spacing: 14) {
                    PalAvatar(pal: Tokens.normalizePal(pal), palette: theme.palette, size: 96, motion: theme.motionLevel,
                              accessibilityLabel: "Your Pal, \(Tokens.palDescription(pal))")
                    VStack(alignment: .leading, spacing: 6) {
                        NPLabel("\(pal.name) says")
                        Text(Tokens.palSay(pal, "focus", ["task": "your notes"]))
                            .font(theme.font(.body, size: 15, relativeTo: .body))
                            .foregroundStyle(theme.onSurface)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                }
                .padding(.vertical, 8)
            }
            .npFormRow()

            Section {
                TextField("Pal", text: $nameDraft)
                    .font(theme.font(.bodySemi, size: 17, relativeTo: .body))
                    .foregroundStyle(theme.onSurface)
                    .focused($nameFocused)
                    .submitLabel(.done)
                    .textInputAutocapitalization(.words)
                    .onSubmit(commitName)
                    .onChange(of: nameDraft) { _, v in
                        if v.count > 14 { nameDraft = String(v.prefix(14)) }
                    }
                    .onChange(of: nameFocused) { _, focused in if !focused { commitName() } }
                    .frame(minHeight: 44)
                    .accessibilityLabel("Your Pal's name, up to 14 characters")
            } header: {
                FormHeader("Name")
            }
            .npFormRow()

            Section {
                NPChoiceRow("Talk style", options: Tokens.tables.palTalk.map { (value: $0.name, label: $0.name) },
                            selection: pal.talk) { v in store.update { $0.pal.talk = v } }
                    .padding(.vertical, 6)
                Text(Tokens.palSay(pal, "helloOkay"))
                    .font(theme.font(.body, size: 15, relativeTo: .body))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .italic()
                    .accessibilityLabel("Sample: \(Tokens.palSay(pal, "helloOkay"))")
                NPChoiceRow("Voice", options: Tokens.tables.palVoices.map { (value: $0.name, label: $0.name) },
                            selection: pal.voice) { v in store.update { $0.pal.voice = v } }
                    .padding(.vertical, 6)
                Button {
                    hear()
                } label: {
                    NPButtonLabel(speech.speaking ? "Stop" : "Hear it", systemImage: speech.speaking ? "stop.fill" : "speaker.wave.2.fill")
                }
                .buttonStyle(.npSecondary)
                .padding(.vertical, 4)
            } header: {
                FormHeader("How \(pal.name) talks")
            } footer: {
                WhyText("In a 4-week trial, heavier daily chatbot use went with more loneliness and dependence (Fang et al., 2025). \(pal.name) keeps its chats short.")
            }
            .npFormRow()

            Section {
                Toggle(isOn: Binding(get: { pal.people }, set: { v in store.update { $0.pal.people = v } })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Points you to people").font(theme.font(.bodySemi, size: 16, relativeTo: .body))
                        Text(pal.people
                            ? "When you seem stuck, \(pal.name) suggests a person or a quiet co-working room before more chat."
                            : "Off. \(pal.name) only mentions people when you ask.")
                            .font(theme.font(.body, size: 13, relativeTo: .footnote))
                            .foregroundStyle(theme.onSurfaceVariant)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .npToggleTint()
                Toggle(isOn: Binding(get: { !prefs.palBubbleHidden }, set: { prefs.palBubbleHidden = !$0 })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Show \(pal.name)’s bubble").font(theme.font(.bodySemi, size: 16, relativeTo: .body))
                        Text("Hidden, \(pal.name) still opens from the Pal tab and the Home tile.")
                            .font(theme.font(.body, size: 13, relativeTo: .footnote))
                            .foregroundStyle(theme.onSurfaceVariant)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .npToggleTint()
            } header: {
                FormHeader("Around you")
            }
            .npFormRow()

            Section {
                Button {
                    lookOpen = true
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(pal.name)’s look").font(theme.font(.bodySemi, size: 16, relativeTo: .body)).foregroundStyle(theme.onSurface)
                            Text(Tokens.palDescription(pal).components(separatedBy: ": ").dropFirst().joined(separator: ": "))
                                .font(theme.font(.body, size: 13, relativeTo: .footnote))
                                .foregroundStyle(theme.onSurfaceVariant)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(theme.onSurfaceVariant)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Shape, colour, eyes, mouth and extras")
            } footer: {
                WhyText("Why build one: people bond more with a character they made (Birk & Mandryk, 2019).")
            }
            .npFormRow()
        }
        .npForm()
        .navigationTitle("Pal")
        .onAppear { nameDraft = pal.name }
        .onChange(of: pal.name) { _, n in if !nameFocused { nameDraft = n } }
        .onDisappear {
            commitName()
            speech.stop()
        }
        .sheet(isPresented: $lookOpen) {
            PalLookSheet()
                .npTheme(theme)
                .contentMargins(.bottom, nil, for: .scrollContent) // the bubble's room is the tab's, not the sheet's
                .presentationDetents([.medium, .large])
        }
    }

    private func commitName() {
        let n = String(nameDraft.trimmingCharacters(in: .whitespacesAndNewlines).prefix(14))
        let name = n.isEmpty ? "Pal" : n
        if name != pal.name { store.update { $0.pal.name = name } }
        nameDraft = name
    }

    private func hear() {
        if speech.speaking {
            speech.stop()
            return
        }
        let v = Tokens.palVoice(pal.voice)
        // PAL_OPTIONS.voice is expo-speech scale (1 = normal); AVSpeech's normal is 0.5.
        speech.say(Tokens.palLine(pal, task: "your notes"), voice: nil, rate: Float(0.5 * v.rate), pitch: Float(v.pitch))
    }
}

/// Pal's look: shape, colour, eyes, mouth, extras — each pick saves at once.
struct PalLookSheet: View {
    @Environment(ThemeStore.self) private var store
    @Environment(\.npTheme) private var theme
    @Environment(\.dismiss) private var dismiss

    private var pal: Appearance.Pal { store.appearance.pal }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Spacer()
                        PalAvatar(pal: Tokens.normalizePal(pal), palette: theme.palette, size: 160, motion: theme.motionLevel,
                                  accessibilityLabel: "Your Pal, \(Tokens.palDescription(pal))")
                        Spacer()
                    }
                    .padding(.vertical, 8)
                }
                .npFormRow()
                Section {
                    choice("Shape", Tokens.tables.palShapes.map(\.name), pal.shape) { v in store.update { $0.pal.shape = v } }
                    VStack(alignment: .leading, spacing: 8) {
                        NPLabel("Colour").accessibilityHidden(true)
                        NPFlowLayout(spacing: 6, lineSpacing: 6) {
                            ForEach(Tokens.tables.palColours, id: \.name) { c in
                                NPSwatch(hex: c.value, selected: pal.colour == c.name, label: "Colour: \(c.name)") {
                                    store.update { $0.pal.colour = c.name }
                                }
                            }
                        }
                    }
                    .padding(.vertical, 6)
                    choice("Eyes", Tokens.tables.palEyes, pal.eyes) { v in store.update { $0.pal.eyes = v } }
                    choice("Mouth", Tokens.tables.palMouths, pal.mouth) { v in store.update { $0.pal.mouth = v } }
                    choice("Extras", Tokens.tables.palExtras, pal.extra) { v in store.update { $0.pal.extra = v } }
                }
                .npFormRow()
            }
            .npForm()
            .navigationTitle("\(pal.name)’s look")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func choice(_ title: String, _ options: [String], _ selection: String, _ pick: @escaping (String) -> Void) -> some View {
        NPChoiceRow(title, options: options.map { (value: $0, label: $0) }, selection: selection, compact: true, onSelect: pick)
            .padding(.vertical, 6)
    }
}
