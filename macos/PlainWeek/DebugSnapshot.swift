#if DEBUG
import AppKit
import SwiftUI

/// Debug builds only: with `PLAINWEEK_SNAPSHOT=<file name>` set, renders the
/// planner to a PNG in the app's temporary directory after launch, so the
/// layout can be checked headlessly (no Screen Recording permission needed).
/// `PLAINWEEK_SNAPSHOT_DARK=1` renders the dark theme, `PLAINWEEK_SNAPSHOT_FOCUS=1`
/// focus mode (without changing the saved setting).
enum DebugSnapshot {
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
        PlannerContent(week: store.week(planner.weekStart),
                       someday: store.someday(weekStart: planner.weekStart, today: planner.today),
                       focus: $focus)
            .background(Theme.background)
    }
}
#endif
