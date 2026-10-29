import NPCore
import NPDay
import NPTheme
import SwiftUI

/// The Home tab: check-in slider, next anchor, minimum day, continue
/// reading, Pal's note — tiles ordered by the appearance's Home layout.
/// SKELETON — owned by the Home+Pal agent (mirror
/// neuropal-expo-app/src/screens/HomeScreen.jsx).
public struct HomeRootView: View {
    @Environment(DayStore.self) private var day
    @Environment(AppNavigator.self) private var nav
    @Environment(\.npTheme) private var theme

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    NPCard {
                        Text("How are you right now?").font(theme.headline).foregroundStyle(theme.onSurface)
                        HStack {
                            ForEach(NervousState.allCases, id: \.self) { s in
                                Button(s.label) {
                                    if s == .red { nav.open(.calm) } else { day.checkIn(s) }
                                }
                                .buttonStyle(.npSecondary)
                            }
                        }
                    }
                    if let next = day.nextAnchor() {
                        NPCard {
                            Text("Next anchor").font(theme.caption).foregroundStyle(theme.onSurfaceVariant)
                            Text(next.title).font(theme.headline).foregroundStyle(theme.onSurface)
                        }
                    }
                }
                .padding(20)
            }
            .background(NPBackground())
            .navigationTitle("Today")
        }
    }
}

/// The calming steps (DBT TIPP), full screen. Never blocked by sign-in or
/// the network. SKELETON — Home+Pal agent (mirror EmergencyScreen.jsx).
public struct CalmStepsView: View {
    @Environment(AppNavigator.self) private var nav
    @Environment(\.npTheme) private var theme

    public init() {}

    public var body: some View {
        ZStack {
            NPBackground()
            VStack(spacing: 24) {
                Text("Let's slow things down").font(theme.title).foregroundStyle(theme.onSurface)
                Button("I'm OK for now") { nav.calmOpen = false }.buttonStyle(.npPrimary)
            }
            .padding()
        }
    }
}
