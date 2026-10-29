import NPCore
import NPDay
import NPTheme
import SwiftUI

@main
struct NeuroPalApp: App {
    @State private var model = AppModel(options: LaunchOptions.current)

    var body: some Scene {
        WindowGroup {
            RootView(widgetGallery: model.options.widgetGallery)
                .environment(model.session)
                .environment(model.navigator)
                .environment(model.themeStore)
                .environment(model.dayStore)
                .environment(model.preferences)
                .onOpenURL { url in
                    if let route = DeepLink.route(for: url) { model.navigator.open(route) }
                }
                .task { await model.start() }
        }
    }
}
