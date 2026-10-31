import XCTest

/// Every screen, launched on the offline fixtures, through Xcode's
/// accessibility audit (contrast, Dynamic Type, hit regions, labels,
/// clipped text, traits). Each issue is printed as one `A11Y-ISSUE` line
/// (screen, kind, element) so a run lists exactly what to fix, then the
/// test fails with the whole list.
///
///   scripts/mac-build.sh ui-test iphone
@MainActor
final class AccessibilityAuditTests: XCTestCase {
    func testHome() throws { try audit("home", ["-NPScreen", "home"]) }
    func testLibrary() throws { try audit("library", ["-NPScreen", "library"]) }
    func testReader() throws { try audit("reader", ["-NPScreen", "reader"]) }
    func testAsk() throws { try audit("ask", ["-NPScreen", "ask"]) }
    func testPal() throws { try audit("pal", ["-NPScreen", "pal"]) }
    func testCalm() throws { try audit("calm", ["-NPScreen", "calm"]) }
    func testSettings() throws { try audit("settings", ["-NPScreen", "settings"]) }
    func testWidgets() throws { try audit("widgets", ["-NPScreen", "widgets"]) }
    func testSignIn() throws { try audit("sign-in", ["-NPSignedOut", "1"]) }
    func testSignInSignal() throws { try audit("sign-in-signal", ["-NPSignedOut", "1", "-NPSkin", "signal"]) }
    func testOfflineHome() throws { try audit("offline-home", ["-NPScreen", "home", "-NPOffline", "1"]) }

    // MARK: -

    private func audit(_ screen: String, _ arguments: [String], file: StaticString = #filePath, line: UInt = #line) throws {
        let app = XCUIApplication()
        app.launchArguments = ["-NPMock", "1"] + arguments
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15), "\(screen): the app didn't start", file: file, line: line)
        // The fixtures answer after ~350 ms; give the screen time to settle.
        Thread.sleep(forTimeInterval: 2.5)

        var issues: [String] = []
        try app.performAccessibilityAudit(for: .all) { issue in
            let entry = "A11Y-ISSUE [\(screen)] \(Self.name(issue.auditType)): \(issue.compactDescription) — \(Self.describe(issue.element))"
            print(entry)
            issues.append(entry)
            return true
        }
        XCTAssertTrue(issues.isEmpty, "\(screen): \(issues.count) accessibility issue(s)\n" + issues.joined(separator: "\n"),
                      file: file, line: line)
        app.terminate()
    }

    private static func describe(_ element: XCUIElement?) -> String {
        guard let element, element.exists else { return "element: (none)" }
        var parts = ["\(element.elementType)"]
        if !element.label.isEmpty { parts.append("label “\(element.label)”") }
        if !element.identifier.isEmpty { parts.append("id \(element.identifier)") }
        let f = element.frame
        parts.append("at (\(Int(f.minX)),\(Int(f.minY))) \(Int(f.width))×\(Int(f.height))")
        return "element: " + parts.joined(separator: ", ")
    }

    private static func name(_ type: XCUIAccessibilityAuditType) -> String {
        let known: [(XCUIAccessibilityAuditType, String)] = [
            (.contrast, "contrast"), (.elementDetection, "element detection"), (.hitRegion, "hit region"),
            (.sufficientElementDescription, "description"), (.dynamicType, "Dynamic Type"),
            (.textClipped, "text clipped"), (.trait, "trait"),
        ]
        return known.filter { type.contains($0.0) }.map(\.1).joined(separator: "+").nonEmpty ?? "type \(type.rawValue)"
    }
}

/// The sign-in screen against the offline fixtures (MockNeuroPalAPI: any
/// email works, "wrong-password" is refused like the server would).
@MainActor
final class SignInFlowTests: XCTestCase {
    func testWrongPasswordStaysOnSignInWithAnError() throws {
        let app = signedOutApp()
        fill(app, email: "ryx@example.com", password: "wrong-password")
        app.buttons["Sign in"].tap()
        XCTAssertTrue(app.staticTexts["Invalid email or password"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["Email"].exists, "still on sign-in")
    }

    func testSignInOpensTheApp() throws {
        let app = signedOutApp()
        fill(app, email: "ryx@example.com", password: "correct horse")
        app.buttons["Sign in"].tap()
        XCTAssertTrue(app.buttons["Library"].waitForExistence(timeout: 8), "the tabs show after signing in")
    }

    func testCalmingStepsOpenWhileSignedOut() throws {
        let app = signedOutApp()
        app.buttons["Need help right now? Open the calming steps"].tap()
        // The full-screen cover takes sign-in out of the way.
        let covered = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.textFields["Email"])
        wait(for: [covered], timeout: 5)
    }

    private func signedOutApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-NPMock", "1", "-NPSignedOut", "1"]
        app.launch()
        XCTAssertTrue(app.textFields["Email"].waitForExistence(timeout: 10))
        return app
    }

    private func fill(_ app: XCUIApplication, email: String, password: String) {
        let emailField = app.textFields["Email"]
        emailField.tap()
        emailField.typeText(email)
        let passwordField = app.secureTextFields["Password"]
        passwordField.tap()
        passwordField.typeText(password)
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
