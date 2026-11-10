import SwiftUI

/// Over the planner while Plain Week is locked: the days stay in view, blurred
/// past reading, under a floating panel with the password, or "Forgot
/// password?", which asks the secret question, then Touch ID or the Mac's
/// login password, then a new password. With Reduce Transparency it is solid.
struct LockScreen: View {
    let lock: AppLock
    @State private var password = ""
    @State private var answer = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var message: String?
    @State private var shake = 0
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            if Motion.reduceTransparency {
                Theme.background.ignoresSafeArea()
            } else {
                // The days stay in view (blurred in LockGate); a light wash
                // keeps the panel in front.
                Theme.background.opacity(0.25).ignoresSafeArea()
            }
            VStack(spacing: 18) {
                Image(systemName: lock.recovery == .newPassword ? "lock.open" : "lock")
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(Theme.foreground)
                    .frame(width: 64, height: 64)
                    .background(Circle().fill(Theme.hover))
                VStack(spacing: 6) {
                    Text(title).font(Theme.heading).tracking(-0.6)
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.mutedForeground)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                content
                    .modifier(Shake(amount: CGFloat(shake)))
                    .animation(Motion.reduceMotion ? nil : .linear(duration: 0.35), value: shake)
                Text(message ?? " ")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.mutedForeground)
                    .frame(height: 16)
            }
            .frame(width: 300)
            .padding(.horizontal, 32)
            .padding(.top, 32)
            .padding(.bottom, 20)
            .floatingMaterial(in: RoundedRectangle(cornerRadius: Theme.panelRadius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.panelRadius, style: .continuous).strokeBorder(Theme.border))
            .shadow(color: .black.opacity(0.12), radius: 24, y: 8)
            .animation(Motion.standard, value: lock.recovery)
        }
        .onAppear { focused = true }
        .onChange(of: lock.recovery) { message = nil; focused = true }
    }

    private var title: String {
        switch lock.recovery {
        case .none: "Plain Week is locked"
        case .question, .confirming: "Forgot your password?"
        case .newPassword: "Choose a new password"
        }
    }

    private var subtitle: String {
        switch lock.recovery {
        case .none: "Enter your Plain Week password."
        case .question: lock.question
        case .confirming: "Confirm with Touch ID or your Mac password."
        case .newPassword: "At least \(AppLock.minimumPasswordLength) characters."
        }
    }

    @ViewBuilder private var content: some View {
        switch lock.recovery {
        case .none:
            VStack(spacing: 12) {
                LockField(placeholder: "Password", text: $password, secure: true, focused: $focused, submit: unlock)
                Button("Unlock", action: unlock).buttonStyle(MonoPrimaryButtonStyle()).disabled(password.isEmpty)
                Button("Forgot password?") { lock.startRecovery() }
                    .buttonStyle(.pressable)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.mutedForeground)
            }
        case .question, .confirming:
            VStack(spacing: 12) {
                LockField(placeholder: "Your answer", text: $answer, secure: false, focused: $focused, submit: checkAnswer)
                Button("Continue", action: checkAnswer).buttonStyle(MonoPrimaryButtonStyle())
                    .disabled(answer.isEmpty || lock.recovery == .confirming)
                Button("Back") { answer = ""; lock.cancelRecovery() }
                    .buttonStyle(.pressable)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.mutedForeground)
            }
        case .newPassword:
            VStack(spacing: 12) {
                LockField(placeholder: "New password", text: $newPassword, secure: true, focused: $focused, submit: reset)
                LockField(placeholder: "Confirm password", text: $confirmPassword, secure: true, focused: nil, submit: reset)
                Button("Set Password and Unlock", action: reset).buttonStyle(MonoPrimaryButtonStyle())
                    .disabled(newPassword.count < AppLock.minimumPasswordLength || newPassword != confirmPassword)
            }
        }
    }

    private func unlock() {
        guard !password.isEmpty else { return }
        switch lock.unlock(password: password) {
        case .unlocked: password = ""; message = nil
        case .wrong: refuse("Wrong password.")
        case .wait(let seconds): refuse("Too many tries. Wait \(seconds) seconds.")
        }
    }

    private func checkAnswer() {
        guard !answer.isEmpty else { return }
        switch lock.answer(answer) {
        case .unlocked:
            answer = ""
            Task { if let error = await lock.confirmOwner() { message = error } }
        case .wrong: refuse("That is not the answer.")
        case .wait(let seconds): refuse("Too many tries. Wait \(seconds) seconds.")
        }
    }

    private func reset() {
        guard newPassword.count >= AppLock.minimumPasswordLength, newPassword == confirmPassword else {
            refuse(newPassword == confirmPassword ? "Too short." : "The passwords do not match.")
            return
        }
        if lock.resetPassword(newPassword) { newPassword = ""; confirmPassword = "" }
    }

    private func refuse(_ text: String) {
        message = text
        password = ""
        shake += 1
    }
}

/// A field in the lock screen and Settings: plain, rounded, grey.
struct LockField: View {
    let placeholder: String
    @Binding var text: String
    var secure: Bool
    var focused: FocusState<Bool>.Binding?
    var submit: () -> Void = {}

    var body: some View {
        Group {
            if secure {
                SecureField("", text: $text, prompt: Text(placeholder))
            } else {
                TextField("", text: $text, prompt: Text(placeholder))
            }
        }
        .textFieldStyle(.plain)
        .font(.system(size: 14))
        .accessibilityLabel(placeholder)
        .onSubmit(submit)
        .modifier(OptionalFocus(binding: focused))
        .padding(.horizontal, 12)
        .frame(height: 36)
        .background(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).fill(Theme.hover))
    }
}

private struct OptionalFocus: ViewModifier {
    var binding: FocusState<Bool>.Binding?
    func body(content: Content) -> some View {
        if let binding { content.focused(binding) } else { content }
    }
}

/// A short sideways shake for a refused password (none with Reduce Motion).
private struct Shake: GeometryEffect {
    var amount: CGFloat
    var animatableData: CGFloat {
        get { amount }
        set { amount = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        guard !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else { return ProjectionTransform(.identity) }
        return ProjectionTransform(CGAffineTransform(translationX: 6 * sin(amount * .pi * 4), y: 0))
    }
}

/// The planner window's content, covered by the lock screen while locked
/// (and out of reach of clicks, keys and VoiceOver).
struct LockGate<Content: View>: View {
    let lock: AppLock
    @ViewBuilder var content: Content

    var body: some View {
        content
            // Shapes and colors stay, words cannot be read.
            .blur(radius: lock.isLocked && !Motion.reduceTransparency ? 22 : 0)
            .disabled(lock.isLocked)
            .accessibilityHidden(lock.isLocked)
            .overlay {
                if lock.isLocked { LockScreen(lock: lock).transition(.opacity) }
            }
            .animation(Motion.standard, value: lock.isLocked)
    }
}

/// Shown in place of tasks elsewhere (menu bar, Settings) while locked.
struct LockedNotice: View {
    var text = "Plain Week is locked."
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "lock").font(.system(size: 13, weight: .medium))
            Text(text).font(.system(size: 13))
        }
        .foregroundStyle(Theme.mutedForeground)
    }
}
