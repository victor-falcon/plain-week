import SwiftUI

/// Keys drawn as a small cap: "⌥⌘D".
struct KeyCaps: View {
    var text: String

    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .medium))
            .monospacedDigit()
            .foregroundStyle(Theme.foreground)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 6)
            .frame(minWidth: 24, minHeight: 20)
            .background(RoundedRectangle(cornerRadius: 5, style: .continuous).fill(Theme.secondary))
            .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(Theme.border))
    }
}

/// The list of keyboard shortcuts that slides out of the task window's
/// trailing edge: how to use them, the task keys, the notes keys, and a way
/// to Settings › Shortcuts to change them.
struct ShortcutsPanel: View {
    static let width: CGFloat = 290
    var close: () -> Void
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Keyboard shortcuts")
                    .font(.system(size: 15, weight: .semibold))
                Spacer()
                Button(action: close) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.mutedForeground)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.pressable)
                .help("Hide the shortcuts (\(Shortcuts.shared.label(.shortcuts)))")
                .accessibilityLabel("Hide the shortcuts")
            }
            .padding(.leading, 20)
            .padding(.trailing, 12)
            .padding(.top, 22)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Hold the keys marked ⌘ Command, ⌥ Option, ⇧ Shift or ⌃ Control, then press the last key. For ⌥⌘D, hold Option and Command and press D.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)

                    ForEach(ShortcutGroup.allCases) { group in
                        section(group)
                    }

                    Button("Change Shortcuts…") {
                        SettingsView.show(.shortcuts)
                        openSettings()
                    }
                    .buttonStyle(PillButtonStyle())
                    .help("Open Settings › Shortcuts")
                }
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 22)
            }
        }
        .frame(width: Self.width)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.sidebar)
        .overlay(alignment: .leading) { Rectangle().fill(Theme.border).frame(width: 1) }
    }

    private func section(_ group: ShortcutGroup) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(group.title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.8)
                .foregroundStyle(Theme.mutedForeground)
            Text(group.explanation)
                .font(.system(size: 12))
                .foregroundStyle(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            VStack(spacing: 6) {
                ForEach(group.actions) { action in
                    row(action.title, Shortcuts.shared.label(action))
                }
                ForEach(group.fixed, id: \.keys) { fixed in
                    row(fixed.title, fixed.keys)
                }
            }
            .padding(.top, 2)
        }
    }

    private func row(_ title: String, _ keys: String) -> some View {
        HStack(spacing: 8) {
            Text(title)
                .font(.system(size: 13))
                .foregroundStyle(Theme.foreground)
                .lineLimit(1)
            Spacer(minLength: 0)
            KeyCaps(text: keys)
        }
        .accessibilityElement(children: .combine)
    }
}
