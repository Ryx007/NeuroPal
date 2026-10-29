import NPCore
import NPTheme
import SwiftUI

/// Sign in / create an account (invite code), with the server address.
/// SKELETON — owned by the Core+Account agent (mirror
/// neuropal-expo-app/src/screens/LoginScreen.jsx).
public struct SignInView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.npTheme) private var theme
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    public init() {}

    public var body: some View {
        ZStack {
            NPBackground()
            VStack(alignment: .leading, spacing: 16) {
                Text("Sign in").font(theme.largeTitle).foregroundStyle(theme.onSurface)
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Password", text: $password)
                    .textContentType(.password)
                if let error {
                    Text(error).font(theme.callout).foregroundStyle(theme.error)
                }
                Button(busy ? "Signing in…" : "Sign in") {
                    Task {
                        busy = true
                        defer { busy = false }
                        do { try await session.signIn(email: email, password: password) } catch {
                            self.error = (error as? LocalizedError)?.errorDescription ?? "Couldn't sign in."
                        }
                    }
                }
                .buttonStyle(.npPrimary)
                .disabled(busy || email.isEmpty || password.isEmpty)
            }
            .textFieldStyle(.roundedBorder)
            .frame(maxWidth: 420)
            .padding(24)
        }
    }
}
