import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    // Widgets + focus Live Activity (lib/platform/ios_extras.dart).
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "NeuroPalIOSExtras") {
      NeuroPalIOSExtras.register(with: registrar)
    }
  }
}
