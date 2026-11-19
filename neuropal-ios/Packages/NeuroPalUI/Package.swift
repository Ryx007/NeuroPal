// swift-tools-version: 6.0
// NeuroPal's SwiftUI features (iPhone + iPad). One target per feature so
// each can be built and previewed on its own; the app target composes them.
import PackageDescription

let package = Package(
    name: "NeuroPalUI",
    platforms: [.iOS(.v18)],
    products: [
        .library(name: "NPTheme", targets: ["NPTheme"]),
        .library(name: "NPAccount", targets: ["NPAccount"]),
        .library(name: "NPReader", targets: ["NPReader"]),
        .library(name: "NPHome", targets: ["NPHome"]),
        .library(name: "NPPal", targets: ["NPPal"]),
        .library(name: "NPSettings", targets: ["NPSettings"]),
    ],
    dependencies: [
        .package(path: "../NeuroPalCore"),
    ],
    targets: [
        // Palette → SwiftUI colours, fonts, the shared primitives, the
        // appearance store (local + server sync).
        .target(name: "NPTheme", dependencies: [
            .product(name: "NPTokens", package: "NeuroPalCore"),
            .product(name: "NPCore", package: "NeuroPalCore"),
        ]),
        // Sign-in, and Settings → Account.
        .target(name: "NPAccount", dependencies: [
            "NPTheme",
            .product(name: "NPCore", package: "NeuroPalCore"),
        ]),
        // Library, the reader (read-aloud highlighting, PDF, EPUB) and Ask.
        .target(name: "NPReader", dependencies: [
            "NPTheme",
            .product(name: "NPCore", package: "NeuroPalCore"),
        ]),
        // Home (check-in, anchors, minimum day), the calming steps.
        .target(name: "NPHome", dependencies: [
            "NPTheme",
            .product(name: "NPCore", package: "NeuroPalCore"),
            .product(name: "NPDay", package: "NeuroPalCore"),
        ]),
        // Pal: the bubble and the assistant sheet.
        .target(name: "NPPal", dependencies: [
            "NPTheme",
            .product(name: "NPCore", package: "NeuroPalCore"),
            .product(name: "NPDay", package: "NeuroPalCore"),
        ]),
        // Settings: look, reading, Pal, account.
        .target(name: "NPSettings", dependencies: [
            "NPTheme", "NPAccount",
            .product(name: "NPCore", package: "NeuroPalCore"),
            .product(name: "NPDay", package: "NeuroPalCore"),
        ]),
    ],
    swiftLanguageModes: [.v5]
)
