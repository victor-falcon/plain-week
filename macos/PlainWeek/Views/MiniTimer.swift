import AppKit
import SwiftUI

/// Starting, finishing and showing the focus timer.
@MainActor
enum TimerActions {
    /// Times `id` (from `day`), minimizes the planner and shows the mini window.
    static func start(_ id: String, day: String?, store: TaskStore, planner: PlannerModel, timer: FocusTimer) {
        timer.start(id, day: day)
        MiniTimerPanel.shared.show(store: store, planner: planner, timer: timer)
        if mainWindow?.isVisible == true { mainWindow?.miniaturize(nil) }
        DayPanel.shared.hideForTimer()
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
            // Back to the day panel if the timer was started from it, else
            // the planner, with the "All done" note.
            if !DayPanel.shared.isOpen { showPlanner() }
            planner.show("All done for \(day.map { DoneList.dayLabel($0, today: planner.today).lowercased() } ?? "now").", canUndo: undo != nil)
        }
    }

    /// The unfinished tasks of the timer's day: the mini window's stack.
    static func stack(store: TaskStore, timer: FocusTimer) -> [PlannerItem] {
        guard let id = timer.taskId, let day = timer.day ?? store.item(id)?.task.date else { return [] }
        return store.openTasks(on: day)
    }

    /// Moves the timer to the next (+1) or previous (−1) task of the stack.
    /// It stops at both ends; false when there is nowhere to go.
    @discardableResult
    static func step(_ offset: Int, store: TaskStore, timer: FocusTimer) -> Bool {
        let tasks = stack(store: store, timer: timer)
        guard let index = tasks.firstIndex(where: { $0.id == timer.taskId }) else {
            // The timed task is done or gone: any scroll goes to the first one left.
            guard let first = tasks.first else { return false }
            timer.switchTask(to: first.id)
            return true
        }
        guard tasks.indices.contains(index + offset) else { return false }
        timer.switchTask(to: tasks[index + offset].id)
        return true
    }

    static func stop(timer: FocusTimer) {
        timer.stop()
        MiniTimerPanel.shared.close()
        DayPanel.shared.returnAfterTimer()
    }

    /// Brings the planner back, in place of the mini window.
    static func showPlanner() {
        guard let window = mainWindow else { return }
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        MiniTimerPanel.shared.close()
    }

    /// Back to the mini window: minimizes the planner, which opens it.
    static func showMiniTimer(store: TaskStore, planner: PlannerModel, timer: FocusTimer) {
        guard let window = mainWindow, window.isVisible, !window.isMiniaturized else {
            MiniTimerPanel.shared.show(store: store, planner: planner, timer: timer)
            return
        }
        window.miniaturize(nil)
        // A window that cannot minimize (full screen) keeps the planner, with its pill.
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

    /// The mini window, for telling its scroll events from other windows'.
    var window: NSWindow? { panel }

    /// The timer shows in one place at a time: the planner (its header pill)
    /// or this mini window. Bringing the planner back closes the mini window;
    /// minimizing the planner while a timer runs opens it.
    private init() {
        let center = NotificationCenter.default
        for name in [NSWindow.didDeminiaturizeNotification, NSWindow.didBecomeKeyNotification] {
            center.addObserver(forName: name, object: nil, queue: .main) { note in
                let window = note.object as? NSWindow
                MainActor.assumeIsolated {
                    guard let window, window === TimerActions.mainWindow, !window.isMiniaturized else { return }
                    MiniTimerPanel.shared.close()
                }
            }
        }
        center.addObserver(forName: NSWindow.didMiniaturizeNotification, object: nil, queue: .main) { note in
            let window = note.object as? NSWindow
            MainActor.assumeIsolated {
                let model = AppModel.shared
                guard let window, window === TimerActions.mainWindow, model.timer.isActive else { return }
                MiniTimerPanel.shared.show(store: model.store, planner: model.planner, timer: model.timer)
            }
        }
    }

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

/// Turns scroll events into single steps, like flicking through a widget
/// stack: one step per trackpad swipe (momentum ignored) or mouse wheel notch.
@MainActor
final class ScrollStepper {
    private var total: CGFloat = 0
    private var fired = false
    private var lastNotch = Date.distantPast

    /// +1 (next, scrolling down the stack), −1 (previous) or nil.
    func step(for event: NSEvent) -> Int? {
        if event.hasPreciseScrollingDeltas {
            guard event.momentumPhase.isEmpty else { return nil }
            if event.phase.contains(.began) {
                total = 0
                fired = false
            }
            total += event.scrollingDeltaY
            guard !fired, abs(total) > 24 else { return nil }
            fired = true
            return total < 0 ? 1 : -1
        }
        guard event.scrollingDeltaY != 0, Date().timeIntervalSince(lastNotch) > 0.3 else { return nil }
        lastNotch = Date()
        return event.scrollingDeltaY < 0 ? 1 : -1
    }
}

/// The stack's page dots, on the mini window's trailing edge.
struct StackDots: View {
    var count: Int
    var index: Int?

    var body: some View {
        VStack(spacing: 4) {
            ForEach(0..<count, id: \.self) { dot in
                Circle()
                    .fill(Theme.foreground.opacity(dot == index ? 0.9 : 0.25))
                    .frame(width: 4, height: 4)
            }
        }
        .animation(Motion.standard, value: index)
        .accessibilityHidden(true)
    }
}

/// The mini window: the task's checkbox and title, the running clock with
/// play / pause, a button back to the planner and one to stop. Scrolling over
/// it moves between the day's unfinished tasks, like a widget stack.
struct MiniTimerView: View {
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(FocusTimer.self) private var timer
    /// The edge the next title slides in from: bottom for next, top for previous.
    @State private var edge: Edge = .bottom
    @State private var stepper = ScrollStepper()
    @State private var scrollMonitor: Any?

    /// Moves to the next or previous task; the title slides the way of the scroll.
    private func step(_ offset: Int) {
        // While locked the task stays hidden, so the stack does not move.
        guard !AppModel.shared.lock.isLocked else { return }
        edge = offset > 0 ? .bottom : .top
        withAnimation(Motion.standard) { _ = TimerActions.step(offset, store: store, timer: timer) }
    }

    private func watchScrolling() {
        guard scrollMonitor == nil else { return }
        scrollMonitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { event in
            guard let window = event.window, window === MiniTimerPanel.shared.window else { return event }
            if let offset = stepper.step(for: event) { step(offset) }
            return nil
        }
    }

    var body: some View {
        let item = timer.taskId.flatMap { store.item($0) }
        let stack = TimerActions.stack(store: store, timer: timer)
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
                // While locked, the clock keeps going but the task stays hidden.
                ZStack(alignment: .leading) {
                    Text(AppModel.shared.lock.isLocked ? "Locked" : item?.task.text ?? "This task was removed")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(item == nil ? Theme.mutedForeground : Theme.foreground)
                        .lineLimit(2)
                        .id(timer.taskId)
                        .transition(Motion.reduceMotion ? .opacity : .push(from: edge))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .clipped()
                .accessibilityHint(stack.count > 1 ? "Scroll or use the up and down arrows to switch tasks" : "")
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
        // ↑ and ↓ move through the stack too, when the mini window has the keys.
        .background {
            Group {
                Button("Previous Task") { step(-1) }.keyboardShortcut(.upArrow, modifiers: [])
                Button("Next Task") { step(1) }.keyboardShortcut(.downArrow, modifiers: [])
            }
            .opacity(0)
            .accessibilityHidden(true)
        }
        .focusEffectDisabled()
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .frame(width: 340)
        .floatingMaterial(in: RoundedRectangle(cornerRadius: Theme.panelRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.panelRadius, style: .continuous).strokeBorder(Theme.border))
        .overlay(alignment: .trailing) {
            // Page dots, as on a widget stack; a long day goes without.
            if (2...9).contains(stack.count) {
                StackDots(count: stack.count, index: stack.firstIndex { $0.id == timer.taskId })
                    .padding(.trailing, 7)
            }
        }
        .onAppear { watchScrolling() }
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
