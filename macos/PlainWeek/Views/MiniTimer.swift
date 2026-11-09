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
        let doneId = store.perform("Mark as Done", undoManager: undo) { store.toggleDone(id) } ?? id
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
            self.panel = panel
        }
        if let name = UserDefaults.standard.string(forKey: "appearance"), name != "system" {
            panel?.appearance = NSAppearance(named: name == "dark" ? .darkAqua : .aqua)
        } else {
            panel?.appearance = nil
        }
        guard let panel else { return }
        let opening = !panel.isVisible
        if opening { place(panel, near: NSEvent.mouseLocation) }
        panel.orderFrontRegardless()
        if opening { appear(panel) }
    }

    /// Fades (and, without Reduce Motion, shrinks) away, the way it came.
    func close() {
        guard let panel, panel.isVisible else { return }
        let frame = panel.frame
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.18
            context.timingFunction = CAMediaTimingFunction(name: .easeIn)
            panel.animator().alphaValue = 0
            if !Motion.reduceMotion { panel.animator().setFrame(Self.scaled(frame, 0.94), display: true) }
        } completionHandler: {
            panel.orderOut(nil)
            panel.setFrame(frame, display: false)
            panel.alphaValue = 1
        }
    }

    /// Next to the click that started it (below and to its right), kept on screen.
    private func place(_ panel: NSPanel, near point: NSPoint) {
        let size = panel.frame.size
        let screen = NSScreen.screens.first { NSMouseInRect(point, $0.frame, false) } ?? NSScreen.main
        guard let visible = screen?.visibleFrame else { return }
        var origin = NSPoint(x: point.x - 24, y: point.y - size.height - 16)
        origin.x = min(max(origin.x, visible.minX + 12), visible.maxX - size.width - 12)
        origin.y = min(max(origin.y, visible.minY + 12), visible.maxY - size.height - 12)
        panel.setFrameOrigin(origin)
    }

    /// Fades in and grows to full size from where it sits, so it reads as
    /// coming out of the ▶ that was clicked.
    private func appear(_ panel: NSPanel) {
        let frame = panel.frame
        panel.alphaValue = 0
        if !Motion.reduceMotion { panel.setFrame(Self.scaled(frame, 0.92), display: false) }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.24
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panel.animator().alphaValue = 1
            panel.animator().setFrame(frame, display: true)
        }
    }

    private static func scaled(_ frame: NSRect, _ factor: CGFloat) -> NSRect {
        let width = frame.width * factor, height = frame.height * factor
        return NSRect(x: frame.midX - width / 2, y: frame.midY - height / 2, width: width, height: height)
    }
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
            .buttonStyle(.pressable)
            .disabled(item == nil)
            .help("Mark as done and go to the next task")

            VStack(alignment: .leading, spacing: 4) {
                Text(item?.task.text ?? "This task was removed")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(item == nil ? Theme.mutedForeground : Theme.foreground)
                    .lineLimit(2)
                if timer.mode == .pomodoro {
                    PomodoroStatus()
                }
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(FocusTimer.format(timer.display(at: context.date)))
                        .font(Theme.heading.monospacedDigit())
                        .tracking(-0.5)
                        .foregroundStyle(timer.isRunning ? Theme.foreground : Theme.mutedForeground)
                        .contentTransition(.numericText())
                }
            }
            Spacer(minLength: 0)

            if timer.mode == .pomodoro {
                Button { timer.skipPhase() } label: {
                    Image(systemName: "forward.end.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.mutedForeground)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.pressable)
                .help(timer.phase == .work ? "Skip to the break (the session will not count)" : "Skip the break")
            }

            Button {
                timer.toggle()
            } label: {
                Image(systemName: timer.isRunning ? "pause.fill" : "play.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.background)
                    .frame(width: 38, height: 38)
                    .background(Circle().fill(Theme.foreground))
            }
            .buttonStyle(.pressable)
            .keyboardShortcut(.space, modifiers: [])
            .help(timer.isRunning ? "Pause (Space)" : "Resume (Space)")

            VStack(spacing: 8) {
                Button { TimerActions.showPlanner() } label: { Image(systemName: "arrow.up.left.and.arrow.down.right") }
                    .help("Open Plain Week")
                Button { TimerActions.stop(timer: timer) } label: { Image(systemName: "xmark") }
                    .help("Stop the timer")
            }
            .buttonStyle(.pressable)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Theme.mutedForeground)
        }
        .focusEffectDisabled()
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .frame(width: 340)
        .floatingMaterial(in: RoundedRectangle(cornerRadius: Theme.panelRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.panelRadius, style: .continuous).strokeBorder(Theme.border))
    }
}

/// "FOCUS ●●○○": the Pomodoro phase and the focus sessions done in this cycle
/// (a long break follows the last one).
struct PomodoroStatus: View {
    @Environment(FocusTimer.self) private var timer

    var body: some View {
        HStack(spacing: 6) {
            Text(timer.phase.label)
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.8)
            HStack(spacing: 3) {
                ForEach(0..<timer.sessionsPerCycle, id: \.self) { index in
                    Circle()
                        .fill(index < timer.sessionsInCycle ? Theme.foreground : .clear)
                        .overlay(Circle().strokeBorder(Theme.mutedForeground.opacity(0.6), lineWidth: 1))
                        .frame(width: 6, height: 6)
                }
            }
            .animation(Motion.standard, value: timer.sessionsInCycle)
        }
        .foregroundStyle(Theme.mutedForeground)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(timer.phase.label.lowercased()), \(timer.sessionsInCycle) of \(timer.sessionsPerCycle) sessions done")
    }
}
