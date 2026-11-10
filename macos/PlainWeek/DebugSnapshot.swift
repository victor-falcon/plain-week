#if DEBUG
import AppKit
import SwiftUI

/// Debug builds only: with `PLAINWEEK_SNAPSHOT=<file name>` set, renders the
/// planner to a PNG in the app's temporary directory after launch, so the
/// layout can be checked headlessly (no Screen Recording permission needed).
/// `PLAINWEEK_SNAPSHOT_DARK=1` renders the dark theme, `PLAINWEEK_SNAPSHOT_FOCUS=1`
/// focus mode (without changing the saved setting).
enum DebugSnapshot {
    /// `PLAINWEEK_WINDOW_SNAPSHOT=<file>` captures the real window (scroll views
    /// included) after `PLAINWEEK_SNAPSHOT_SHIFT=<days>` scrolls the strip.
    static func scheduleWindowCaptureIfRequested(planner: PlannerModel, store: TaskStore, timer: FocusTimer) {
        let env = ProcessInfo.processInfo.environment
        guard let name = env["PLAINWEEK_WINDOW_SNAPSHOT"] else { return }
        let shift = Int(env["PLAINWEEK_SNAPSHOT_SHIFT"] ?? "0") ?? 0
        let width = Double(env["PLAINWEEK_WINDOW_WIDTH"] ?? "")
        let dark = env["PLAINWEEK_SNAPSHOT_DARK"] == "1"
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            if dark {
                NSApp.appearance = NSAppearance(named: .darkAqua)
                NSApp.windows.forEach { $0.appearance = NSAppearance(named: .darkAqua) }
            }
            if let width, let window = NSApp.windows.first(where: \.isVisible) {
                var frame = window.frame
                frame.size.width = width
                window.setFrame(frame, display: true)
            }
            planner.scroll(by: shift)
            // PLAINWEEK_SNAPSHOT_OPEN=<task id> captures that task's sheet.
            if let id = env["PLAINWEEK_SNAPSHOT_OPEN"] { planner.open(id) }
            // PLAINWEEK_SNAPSHOT_SELECT=<day> selects (and in focus mode focuses) a day.
            if let day = env["PLAINWEEK_SNAPSHOT_SELECT"] { planner.reveal(day) }
            // PLAINWEEK_SNAPSHOT_SHEET=review|palette|quick opens that window.
            switch env["PLAINWEEK_SNAPSHOT_SHEET"] {
            case "review": planner.showReview = true
            case "palette": planner.showPalette = true
            case "quick": QuickCapture.shared.show()
            default: break
            }
            // PLAINWEEK_SNAPSHOT_LOCK=1|recover shows the lock screen (a throwaway
            // lock in the temporary directory, removed after the capture).
            if let mode = env["PLAINWEEK_SNAPSHOT_LOCK"] {
                let lock = AppModel.shared.lock
                lock.setUp(password: "debug", question: "Name of your first teacher?", answer: "x", rounds: 1)
                lock.lock()
                if mode == "recover" { lock.startRecovery() }
            }
            // PLAINWEEK_SNAPSHOT_DAYPANEL=left|right shows the day panel on that side
            // (the user's saved side is put back after the capture).
            if let side = env["PLAINWEEK_SNAPSHOT_DAYPANEL"] {
                let saved = UserDefaults.standard.string(forKey: DayPanel.sideKey)
                UserDefaults.standard.set(side, forKey: DayPanel.sideKey)
                DayPanel.shared.show()
                UserDefaults.standard.set(saved, forKey: DayPanel.sideKey)
            }
            // PLAINWEEK_SNAPSHOT_SETTINGS=<pane> opens Settings on that pane.
            if env["PLAINWEEK_SNAPSHOT_SETTINGS"] != nil {
                NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
            }
            // PLAINWEEK_SNAPSHOT_TIMER=<day> starts its timer and captures the mini window.
            if let day = env["PLAINWEEK_SNAPSHOT_TIMER"] {
                TimerActions.startDay(day, store: store, planner: planner, timer: timer)
                // PLAINWEEK_SNAPSHOT_POMODORO=1 shows it as Pomodoro (the user's setting is untouched).
                if env["PLAINWEEK_SNAPSHOT_POMODORO"] == "1", let id = timer.taskId { timer.start(id, day: day, mode: .pomodoro) }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                let popover = env["PLAINWEEK_SNAPSHOT_PICKER"] != nil
                    ? NSApp.windows.first(where: { $0.isVisible && String(describing: type(of: $0)).contains("Popover") }) : nil
                let settings = env["PLAINWEEK_SNAPSHOT_SETTINGS"] != nil
                    ? NSApp.windows.first(where: { $0.isVisible && $0.title != "Plain Week" && !($0 is NSPanel) && $0.frame.width > 600 }) : nil
                let dayPanel = env["PLAINWEEK_SNAPSHOT_DAYPANEL"] != nil ? NSApp.windows.first(where: { $0.isVisible && $0.title == "Day" }) : nil
                let main = dayPanel != nil ? dayPanel : settings != nil ? settings : popover != nil ? popover : (env["PLAINWEEK_SNAPSHOT_TIMER"] != nil || env["PLAINWEEK_SNAPSHOT_SHEET"] == "quick") ? NSApp.windows.first(where: { $0 is NSPanel && $0.isVisible })
                    : NSApp.windows.first(where: { $0.isVisible && $0.title == "Plain Week" }) ?? NSApp.windows.first(where: \.isVisible)
                guard let window = main?.attachedSheet ?? main,
                      let image = CGWindowListCreateImage(.null, .optionIncludingWindow, CGWindowID(window.windowNumber), [.boundsIgnoreFraming, .bestResolution])
                else {
                    NSLog("Window capture failed; windows: %@", NSApp.windows.map { "\(type(of: $0)) visible=\($0.isVisible)" }.joined(separator: ", "))
                    exit(1)
                }
                let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(name)
                try? NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])?.write(to: url)
                NSLog("first visible day %@, %d days visible", planner.weekStart, planner.visibleCount)
                try? FileManager.default.removeItem(at: URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("lock.json"))
                // terminate(_:) waits while a sheet is open; a capture run just ends.
                exit(0)
            }
        }
    }

    static func scheduleIfRequested(store: TaskStore, planner: PlannerModel) {
        let env = ProcessInfo.processInfo.environment
        guard let name = env["PLAINWEEK_SNAPSHOT"] else { return }
        let dark = env["PLAINWEEK_SNAPSHOT_DARK"] == "1"
        let savedFocus = planner.focusMode
        planner.focusMode = env["PLAINWEEK_SNAPSHOT_FOCUS"] == "1"
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            defer { planner.focusMode = savedFocus }
            if dark { NSApp.appearance = NSAppearance(named: .darkAqua) }
            NSAppearance(named: dark ? .darkAqua : .aqua)!.performAsCurrentDrawingAppearance {
                let view = SnapshotView()
                    .environment(store)
                    .environment(planner)
                    .environment(FocusTimer())
                    .environment(AppModel.shared.timeLog)
                    .environment(AppModel.shared.calendar)
                    .environment(\.colorScheme, dark ? .dark : .light)
                    .frame(width: 1320)
                let renderer = ImageRenderer(content: view)
                renderer.scale = 2
                let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(name)
                if let image = renderer.nsImage, let tiff = image.tiffRepresentation,
                   let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
                    try? png.write(to: url)
                }
                planner.focusMode = savedFocus
                NSApp.terminate(nil)
            }
        }
    }
}

private struct SnapshotView: View {
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @FocusState private var focus: String?

    var body: some View {
        PlannerMain(focus: $focus)
            .environment(\.staticDayStrip, true)
            .background(Theme.background)
    }
}
#endif
