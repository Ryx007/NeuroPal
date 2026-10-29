import NPCore
import NPDay
import NPTheme
import SwiftUI

@main
struct NeuroPalApp: App {
    @State private var model = AppModel(options: LaunchOptions.current)

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model.session)
                .environment(model.navigator)
                .environment(model.themeStore)
                .environment(model.dayStore)
                .onOpenURL { url in
                    if let route = DeepLink.route(for: url) { model.navigator.open(route) }
                }
                .task { await model.start() }
        }
    }
}
