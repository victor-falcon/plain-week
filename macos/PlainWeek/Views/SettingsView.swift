import SwiftUI

/// Settings: appearance, carry over and data (export / import), built from
/// the same black-and-white parts as the planner.
struct SettingsView: View {
    @AppStorage("appearance") private var appearance = Appearance.system.rawValue
    @AppStorage(PlannerModel.carryOverKey) private var carryOver = true
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            section("Appearance") {
                MonoSegmented(options: Appearance.allCases, selection: Binding(
                    get: { Appearance(rawValue: appearance) ?? .system },
                    set: { appearance = $0.rawValue }
                ), label: \.label)
                note("Light or Dark for Plain Week only, or follow the system.")
            }

            section("Planner") {
                Toggle(isOn: $carryOver) {
                    Text("Move unfinished tasks to today").font(.system(size: 14, weight: .medium))
                }
                .toggleStyle(MonoSwitchStyle())
                .onChange(of: carryOver) { _, on in
                    if on { store.carryOverIfEnabled(today: planner.today, planner: planner) }
                }
                note("Each morning, unfinished tasks from earlier days move to the end of today, like a paper planner rewritten each day. Repeating tasks stay on their dates.")
            }

            section("Data") {
                HStack(spacing: 8) {
                    Button("Export Tasks…") { DataTransfer.export(store, planner: planner) }
                        .buttonStyle(PillButtonStyle())
                    Button("Import Tasks…") { DataTransfer.import(into: store, planner: planner) }
                        .buttonStyle(PillButtonStyle())
                }
                note("Backups use the same JSON format as the Plain Week web app, so you can move your week between them. Importing adds tasks next to the ones you have.")
            }
        }
        .padding(28)
        .frame(width: 480, alignment: .leading)
        .background(Theme.background)
        .focusEffectDisabled()
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.8)
                .foregroundStyle(Theme.mutedForeground)
            content()
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12))
            .foregroundStyle(Theme.mutedForeground)
            .fixedSize(horizontal: false, vertical: true)
    }
}
