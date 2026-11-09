import AppKit
import SwiftUI
import UniformTypeIdentifiers

@main
struct PlainWeekApp: App {
    private let model = AppModel.shared
    @AppStorage("appearance") private var appearance = Appearance.system.rawValue
    @AppStorage(MenuBarSettings.key) private var showMenuBar = true

    var body: some Scene {
        Window("Plain Week", id: "planner") {
            PlannerView()
                .environment(model.store)
                .environment(model.planner)
                .environment(model.timer)
                .environment(model.timeLog)
                .environment(model.calendar)
                .frame(minWidth: 760, minHeight: 600)
                .ignoresSafeArea(.container, edges: .top)
                .preferredColorScheme(Appearance(rawValue: appearance)?.colorScheme)
                .tint(Theme.foreground)
                // Popovers, sheets and the mini timer are windows of their own:
                // give them the app's Light / Dark choice too, not the system's.
                .onChange(of: appearance, initial: true) { _, value in
                    NSApp.appearance = switch Appearance(rawValue: value) {
                    case .light: NSAppearance(named: .aqua)
                    case .dark: NSAppearance(named: .darkAqua)
                    default: nil
                    }
                }
                .onAppear {
                    model.launch()
                    #if DEBUG
                    DebugSnapshot.scheduleIfRequested(store: model.store, planner: model.planner)
                    DebugSnapshot.scheduleWindowCaptureIfRequested(planner: model.planner, store: model.store, timer: model.timer)
                    #endif
                }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1360, height: 900)
        .commands { PlannerCommands(store: model.store, planner: model.planner) }

        MenuBarExtra(isInserted: $showMenuBar) {
            MenuBarView()
                .environment(model.store)
                .environment(model.planner)
                .environment(model.timer)
                .preferredColorScheme(Appearance(rawValue: appearance)?.colorScheme)
        } label: {
            MenuBarLabel().environment(model.timer)
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView()
                .environment(model.store)
                .environment(model.planner)
                .environment(model.timer)
                .environment(model.calendar)
                .preferredColorScheme(Appearance(rawValue: appearance)?.colorScheme)
                .tint(Theme.foreground)
        }
    }
}

enum MenuBarSettings {
    static let key = "showMenuBar"
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
            Button("New Backlog Task") { planner.focusRequest = DataTransfer.somedayKey }
                .keyboardShortcut("n", modifiers: [.command, .shift])
        }
        CommandGroup(replacing: .importExport) {
            Button("Export Tasks…") { DataTransfer.export(store, planner: planner) }
                .keyboardShortcut("e", modifiers: [.command, .shift])
            Button("Import Tasks…") { DataTransfer.import(into: store, planner: planner) }
                .keyboardShortcut("i", modifiers: [.command, .shift])
        }
        CommandGroup(after: .toolbar) {
            Button(planner.showSidebar ? "Hide Sidebar" : "Show Sidebar") { planner.showSidebar.toggle() }
                .keyboardShortcut("s", modifiers: [.command, .control])
            Button(planner.focusMode ? "Turn Off Focus Mode" : "Turn On Focus Mode") { planner.toggleFocusMode() }
                .keyboardShortcut("f", modifiers: [.command, .shift])
            Divider()
        }
        CommandGroup(after: .newItem) {
            Button("Quick Add…  ⌥Space") { QuickCapture.shared.show() }
        }
        CommandMenu("Go") {
            Button("Search and Commands…") { planner.showPalette = true }
                .keyboardShortcut("k")
            Button("Weekly Review") { planner.showReview = true }
                .keyboardShortcut("r", modifiers: [.command, .shift])
            Divider()
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
