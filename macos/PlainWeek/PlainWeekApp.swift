import AppKit
import SwiftUI
import UniformTypeIdentifiers

@main
struct PlainWeekApp: App {
    @State private var store = TaskStore()
    @State private var planner = PlannerModel()
    @AppStorage("appearance") private var appearance = Appearance.system.rawValue

    var body: some Scene {
        Window("Plain Week", id: "planner") {
            PlannerView()
                .environment(store)
                .environment(planner)
                .frame(minWidth: 1040, minHeight: 640)
                .ignoresSafeArea(.container, edges: .top)
                .preferredColorScheme(Appearance(rawValue: appearance)?.colorScheme)
                .onAppear {
                    planner.onDayChange = { [store, planner] today in store.carryOverIfEnabled(today: today, planner: planner) }
                    planner.startClock()
                    store.carryOverIfEnabled(today: planner.today, planner: planner)
                    #if DEBUG
                    DebugSnapshot.scheduleIfRequested(store: store, planner: planner)
                    #endif
                }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1360, height: 900)
        .commands { PlannerCommands(store: store, planner: planner) }

        Settings {
            SettingsView()
                .environment(store)
                .environment(planner)
                .preferredColorScheme(Appearance(rawValue: appearance)?.colorScheme)
        }
    }
}

enum Appearance: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

struct PlannerCommands: Commands {
    var store: TaskStore
    var planner: PlannerModel

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("New Task Today") {
                planner.goToToday()
                planner.focusRequest = planner.today
            }
            .keyboardShortcut("n")
            Button("New Someday Task") { planner.focusRequest = DataTransfer.somedayKey }
                .keyboardShortcut("n", modifiers: [.command, .shift])
        }
        CommandGroup(replacing: .importExport) {
            Button("Export Tasks…") { DataTransfer.export(store, planner: planner) }
                .keyboardShortcut("e", modifiers: [.command, .shift])
            Button("Import Tasks…") { DataTransfer.import(into: store, planner: planner) }
                .keyboardShortcut("i", modifiers: [.command, .shift])
        }
        CommandMenu("Go") {
            Button("Today") { planner.goToToday() }
                .keyboardShortcut("t")
            Button("Previous Week") { planner.previousWeek() }
                .keyboardShortcut("[")
            Button("Next Week") { planner.nextWeek() }
                .keyboardShortcut("]")
        }
    }
}

/// JSON backups in the web app's export format, so a file moves both ways.
enum DataTransfer {
    static let somedayKey = "someday"

    static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
    }

    static func export(_ store: TaskStore, planner: PlannerModel) {
        let file = store.exportFile(appVersion: appVersion)
        guard !file.tasks.isEmpty else { planner.show("There are no tasks to export."); return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.json]
        panel.nameFieldStringValue = "plain-week-export-\(DateKey.local()).json"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        do {
            try encoder.encode(file).write(to: url, options: .atomic)
            planner.show("Exported \(file.tasks.count) rows.")
        } catch {
            planner.show("Could not export your data.")
        }
    }

    static func `import`(into store: TaskStore, planner: PlannerModel) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let file = try TaskStore.parseImport(Data(contentsOf: url))
            let undo = NSApp.keyWindow?.undoManager
            let count = store.perform("Import", undoManager: undo) { store.importTasks(file) }
            planner.show("Imported \(count) \(count == 1 ? "task" : "tasks").", canUndo: undo != nil)
        } catch {
            planner.show(error.localizedDescription)
        }
    }
}
