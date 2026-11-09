import SwiftUI

/// Settings: appearance, carry over and data (export / import).
struct SettingsView: View {
    @AppStorage("appearance") private var appearance = Appearance.system.rawValue
    @AppStorage(PlannerModel.carryOverKey) private var carryOver = true
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        Form {
            Picker("Appearance", selection: $appearance) {
                ForEach(Appearance.allCases) { Text($0.label).tag($0.rawValue) }
            }
            .pickerStyle(.segmented)

            Toggle("Move unfinished tasks to today", isOn: $carryOver)
                .onChange(of: carryOver) { _, on in
                    if on { store.carryOverIfEnabled(today: planner.today, planner: planner) }
                }
            Text("Each morning, unfinished tasks from earlier days move to the end of today, like a paper planner rewritten each day. Repeating tasks stay on their dates.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Section("Data") {
                HStack {
                    Button("Export Tasks…") { DataTransfer.export(store, planner: planner) }
                    Button("Import Tasks…") { DataTransfer.import(into: store, planner: planner) }
                }
                Text("Backups use the same JSON format as the Plain Week web app, so you can move your week between them. Importing adds tasks next to the ones you have.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .formStyle(.grouped)
        .frame(width: 480)
        .padding(.vertical, 8)
    }
}
