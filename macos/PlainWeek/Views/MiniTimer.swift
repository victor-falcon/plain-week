import AppKit
import SwiftUI

/// Starting, finishing and showing the focus timer.
@MainActor
enum TimerActions {
    /// Times `id` (from `day`), minimizes the planner and shows the mini window.
    static func start(_ id: String, day: String?, store: TaskStore, planner: PlannerModel, timer: FocusTimer) {
        timer.start(id, day: day)
        MiniTimerPanel.shared.show(store: store, planner: planner, timer: timer)
        mainWindow?.miniaturize(nil)
    }

    /// Starts on the day's next unfinished task, if it has one.
    static func startDay(_ day: String, store: TaskStore, planner: PlannerModel, timer: FocusTimer) {
        guard let next = store.openTasks(on: day).first else { return }
        start(next.id, day: day, store: store, planner: planner, timer: timer)
    }

    /// Completes the timed task and moves on to the day's next unfinished one,
    /// or ends the timer when the day is done.
    static func complete(store: TaskStore, planner: PlannerModel, timer: FocusTimer) {
        guard let id = timer.taskId else { return }
        let undo = mainWindow?.undoManager
        let doneId = store.perform("Complete Task", undoManager: undo) { store.toggleDone(id) } ?? id
        let day = timer.day ?? store.item(doneId)?.task.date
        if let day, let next = store.openTasks(on: day).first(where: { $0.id != doneId }) {
            timer.start(next.id, day: day)
        } else {
            stop(timer: timer)
            showPlanner()
            planner.show("All done for \(day.map { DoneList.dayLabel($0, today: planner.today).lowercased() } ?? "now").", canUndo: undo != nil)
        }
    }

    static func stop(timer: FocusTimer) {
        timer.stop()
        MiniTimerPanel.shared.close()
    }

    static func showPlanner() {
        guard let window = mainWindow else { return }
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    static var mainWindow: NSWindow? {
        NSApp.windows.first { $0.title == "Plain Week" && !($0 is NSPanel) }
    }
}

/// The floating, always-on-top mini window of the timer. It never takes focus
/// from other apps (a non-activating panel) and shows on every Space.
@MainActor
final class MiniTimerPanel {
    static let shared = MiniTimerPanel()
    private var panel: NSPanel?

    func show(store: TaskStore, planner: PlannerModel, timer: FocusTimer) {
        if panel == nil {
            let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 340, height: 104),
                                styleMask: [.titled, .closable, .fullSizeContentView, .nonactivatingPanel],
                                backing: .buffered, defer: false)
            panel.titleVisibility = .hidden
            panel.titlebarAppearsTransparent = true
            [.closeButton, .miniaturizeButton, .zoomButton].forEach { panel.standardWindowButton($0)?.isHidden = true }
            panel.level = .floating
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            panel.isMovableByWindowBackground = true
            panel.hidesOnDeactivate = false
            panel.isOpaque = false
            panel.backgroundColor = .clear
            panel.hasShadow = true
            panel.isReleasedWhenClosed = false
            panel.contentView = NSHostingView(rootView: MiniTimerView()
                .environment(store)
                .environment(planner)
                .environment(timer)
                .tint(Theme.foreground))
            if let screen = NSScreen.main?.visibleFrame {
                panel.setFrameOrigin(NSPoint(x: screen.maxX - 360, y: screen.maxY - 124))
            }
            self.panel = panel
        }
        if let name = UserDefaults.standard.string(forKey: "appearance"), name != "system" {
            panel?.appearance = NSAppearance(named: name == "dark" ? .darkAqua : .aqua)
        } else {
            panel?.appearance = nil
        }
        panel?.orderFrontRegardless()
    }

    func close() { panel?.orderOut(nil) }
}

/// The mini window: the task's checkbox and title, the running clock with
/// play / pause, a button back to the planner and one to stop.
struct MiniTimerView: View {
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(FocusTimer.self) private var timer

    var body: some View {
        let item = timer.taskId.flatMap { store.item($0) }
        HStack(alignment: .center, spacing: 14) {
            Button {
                TimerActions.complete(store: store, planner: planner, timer: timer)
            } label: {
                TaskCheckbox(color: item?.task.color ?? .none, done: false, size: 22)
            }
            .buttonStyle(.plain)
            .disabled(item == nil)
            .help("Complete and go to the next task")

            VStack(alignment: .leading, spacing: 4) {
                Text(item?.task.text ?? "This task was removed")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(item == nil ? Theme.mutedForeground : Theme.foreground)
                    .lineLimit(2)
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(FocusTimer.format(timer.elapsed(at: context.date)))
                        .font(.system(size: 24, weight: .bold).monospacedDigit())
                        .tracking(-0.5)
                        .foregroundStyle(timer.isRunning ? Theme.foreground : Theme.mutedForeground)
                        .contentTransition(.numericText())
                }
            }
            Spacer(minLength: 0)

            Button {
                timer.toggle()
            } label: {
                Image(systemName: timer.isRunning ? "pause.fill" : "play.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.background)
                    .frame(width: 38, height: 38)
                    .background(Circle().fill(Theme.foreground))
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.space, modifiers: [])
            .help(timer.isRunning ? "Pause (Space)" : "Resume (Space)")

            VStack(spacing: 8) {
                Button { TimerActions.showPlanner() } label: { Image(systemName: "arrow.up.left.and.arrow.down.right") }
                    .help("Open Plain Week")
                Button { TimerActions.stop(timer: timer) } label: { Image(systemName: "xmark") }
                    .help("Stop the timer")
            }
            .buttonStyle(.plain)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Theme.mutedForeground)
        }
        .focusEffectDisabled()
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .frame(width: 340)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Theme.border))
    }
}
