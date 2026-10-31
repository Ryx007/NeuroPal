import NPTheme
import SwiftUI
import UIKit

/// Accessibility: NeuroPal follows the system settings; this says which are
/// on and where to change them.
struct AccessibilitySettingsView: View {
    @Environment(\.npTheme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.legibilityWeight) private var weight
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.openURL) private var openURL
    let openLook: () -> Void

    var body: some View {
        Form {
            Section {
                WhyText("NeuroPal follows your device’s accessibility settings, everywhere in the app.")
                    .padding(.vertical, 4)
                status("Text size", typeSize.isAccessibilitySize ? "Large (accessibility size)" : Self.name(typeSize))
                status("Reduce Motion", reduceMotion ? "On — nothing moves" : "Off")
                status("Bold Text", weight == .bold ? "On" : "Off")
                status("Increase Contrast", contrast == .increased ? "On" : "Off")
                Button {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                } label: {
                    NPButtonLabel("Open the Settings app", systemImage: "gear")
                }
                .buttonStyle(.npSecondary)
                .padding(.vertical, 4)
            } header: {
                FormHeader("From your device")
            } footer: {
                WhyText("Text size, Reduce Motion and Bold Text live in the Settings app under Accessibility and Display & Text Size.")
            }
            .npFormRow()

            Section {
                tip("The calmest look", "Make it yours → Saved looks → Overwhelmed: nothing moves, no background.")
                tip("The highest contrast", "Classic → Contrast (black, white and yellow), or Signal with More contrast.")
                tip("Still, in this app only", "Signal → Fine-tune → Motion → Still stops every moving background.")
                Button("Open Make it yours", action: openLook)
                    .buttonStyle(.npSecondary)
                    .padding(.vertical, 4)
            } header: {
                FormHeader("In NeuroPal")
            }
            .npFormRow()
        }
        .npForm()
        .navigationTitle("Accessibility")
    }

    private func status(_ title: String, _ value: String) -> some View {
        LabeledContent {
            Text(value)
                .font(theme.font(.body, size: 15, relativeTo: .body))
                .foregroundStyle(theme.onSurfaceVariant)
                .multilineTextAlignment(.trailing)
        } label: {
            Text(title).font(theme.font(.bodySemi, size: 16, relativeTo: .body)).foregroundStyle(theme.onSurface)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }

    private func tip(_ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(theme.font(.bodySemi, size: 16, relativeTo: .body)).foregroundStyle(theme.onSurface)
            Text(text)
                .font(theme.font(.body, size: 14, relativeTo: .callout))
                .foregroundStyle(theme.onSurfaceVariant)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    static func name(_ size: DynamicTypeSize) -> String {
        switch size {
        case .xSmall, .small: return "Small"
        case .medium, .large: return "Default"
        case .xLarge, .xxLarge: return "Larger"
        case .xxxLarge: return "Largest standard"
        default: return "Large (accessibility size)"
        }
    }
}

/// About: version and the privacy promise.
struct AboutSettingsView: View {
    @Environment(\.npTheme) private var theme

    var body: some View {
        Form { AboutSection() }
            .npForm()
            .navigationTitle("About")
    }
}

/// The About rows (also shown on the iPhone Settings list).
struct AboutSection: View {
    @Environment(\.npTheme) private var theme

    var body: some View {
        Section {
            LabeledContent {
                Text(Self.version)
                    .font(theme.font(.mono, size: 14, relativeTo: .body))
                    .foregroundStyle(theme.onSurfaceVariant)
            } label: {
                Text("NeuroPal").font(theme.font(.bodySemi, size: 16, relativeTo: .body)).foregroundStyle(theme.onSurface)
            }
            .frame(minHeight: 44)
            .accessibilityElement(children: .combine)
            VStack(alignment: .leading, spacing: 6) {
                Label {
                    Text("Your documents stay on your server. Nothing you read, write or ask is used to train AI models.")
                        .font(theme.font(.body, size: 15, relativeTo: .body))
                        .foregroundStyle(theme.onSurface)
                        .fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "lock.shield").foregroundStyle(theme.accentText)
                }
                Label {
                    Text("No ads, no analytics, no tracking. Your look syncs to your own account only.")
                        .font(theme.font(.body, size: 15, relativeTo: .body))
                        .foregroundStyle(theme.onSurface)
                        .fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "hand.raised").foregroundStyle(theme.accentText)
                }
            }
            .padding(.vertical, 6)
        } header: {
            FormHeader("About")
        }
        .npFormRow()
    }

    static var version: String {
        let info = Bundle.main.infoDictionary
        let v = info?["CFBundleShortVersionString"] as? String ?? "–"
        let b = info?["CFBundleVersion"] as? String ?? "–"
        return "\(v) (\(b))"
    }
}
