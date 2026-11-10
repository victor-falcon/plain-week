import AppKit
import Observation
import SwiftUI

/// The day panel: one day in a narrow window (350pt) as tall as the screen,
/// docked to its left or right edge (Settings › General), beside whatever
/// you are working in. View › Day Panel (⇧⌘D) opens and closes it. It is one
/// or the other: the planner window hides while the panel shows, and showing
/// the planner (↖↘, the Dock, the menu bar) closes the panel.
@MainActor
@Observable
final class DayPanel {
    static let shared = DayPanel()
    static let sideKey = "dayPanelSide"
    static let openKey = "dayPanelOpen"
    static let width: CGFloat = 350

    enum Side: String, CaseIterable, Identifiable {
        case left, right
        var id: String { rawValue }
        var label: String { rawValue.capitalized }
    }

    /// The day shown; nil follows today.
    var day: String?
    private(set) var isOpen = false
    @ObservationIgnored private var panel: NSPanel?
    @ObservationIgnored private var observer: NSObjectProtocol?
    @ObservationIgnored private var plannerObserver: NSObjectProtocol?
    @ObservationIgnored private var terminating = false

    static var side: Side { Side(rawValue: UserDefaults.standard.string(forKey: sideKey) ?? "") ?? .right }

    func toggle() { isOpen ? close() : show() }

    func show() {
        let model = AppModel.shared
        if panel == nil {
            let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: Self.width, height: 600),
                                styleMask: [.titled, .closable, .fullSizeContentView],
                                backing: .buffered, defer: false)
            panel.title = "Day"
            panel.titleVisibility = .hidden
            panel.titlebarAppearsTransparent = true
            panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
            panel.standardWindowButton(.zoomButton)?.isHidden = true
            panel.collectionBehavior = [.fullScreenAuxiliary]
            panel.hidesOnDeactivate = false
            panel.isReleasedWhenClosed = false
            panel.isMovable = false
            panel.backgroundColor = NSColor(Theme.background)
            panel.contentView = NSHostingView(rootView: LockGate(lock: model.lock) { DayPanelView() }
                .environment(model.store)
                .environment(model.planner)
                .environment(model.timer)
                .environment(model.timeLog)
                .environment(model.calendar)
                .tint(Theme.foreground))
            // The close button counts as closing the panel.
            observer = NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: panel, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.closed() }
            }
            // The planner coming to the front, however it got there, ends the panel.
            plannerObserver = NotificationCenter.default.addObserver(forName: NSWindow.didBecomeKeyNotification, object: nil, queue: .main) { note in
                guard let window = note.object as? NSWindow, window === TimerActions.mainWindow else { return }
                Task { @MainActor in if DayPanel.shared.isOpen { DayPanel.shared.close(showPlanner: false) } }
            }
            NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { _ in
                Task { @MainActor in DayPanel.shared.terminating = true }
            }
            self.panel = panel
        }
        guard let panel else { return }
        if let name = UserDefaults.standard.string(forKey: "appearance"), name != "system" {
            panel.appearance = NSAppearance(named: name == "dark" ? .darkAqua : .aqua)
        } else {
            panel.appearance = nil
        }
        place()
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        isOpen = true
        UserDefaults.standard.set(true, forKey: Self.openKey)
        TimerActions.mainWindow?.orderOut(nil)
    }

    /// Closes the panel and (unless the planner is already on its way)
    /// brings the planner back.
    func close(showPlanner: Bool = true) {
        hiddenForTimer = false
        reopenPlanner = showPlanner
        panel?.close()
    }

    @ObservationIgnored private var reopenPlanner = true

    /// Steps aside while a timer runs (the mini window takes over) and comes
    /// back when it stops.
    @ObservationIgnored private(set) var hiddenForTimer = false

    func hideForTimer() {
        guard isOpen, let panel, panel.isVisible else { return }
        hiddenForTimer = true
        panel.orderOut(nil)
    }

    /// Shows the panel again if a timer hid it; true when it did.
    @discardableResult
    func returnAfterTimer() -> Bool {
        guard hiddenForTimer, let panel else { return false }
        hiddenForTimer = false
        place()
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    private func closed() {
        // Quitting keeps the panel's state, so it comes back at launch.
        guard !terminating else { return }
        isOpen = false
        UserDefaults.standard.set(false, forKey: Self.openKey)
        if reopenPlanner { showMainWindow() }
        reopenPlanner = true
    }

    /// Full height of the screen it is on (below the menu bar, above the
    /// Dock), against its left or right edge.
    func place() {
        guard let panel else { return }
        let screen = panel.screen ?? NSScreen.main
        guard let visible = screen?.visibleFrame else { return }
        let x = Self.side == .left ? visible.minX : visible.maxX - Self.width
        panel.setFrame(NSRect(x: x, y: visible.minY, width: Self.width, height: visible.height), display: true, animate: panel.isVisible && !Motion.reduceMotion)
    }

    /// Back to the full planner (the panel closes).
    func openPlanner() { close() }

    private func showMainWindow() {
        if let window = TimerActions.mainWindow {
            if window.isMiniaturized { window.deminiaturize(nil) }
            window.makeKeyAndOrderFront(nil)
        }
        NSApp.activate(ignoringOtherApps: true)
    }
}

/// The panel's content: day arrows and Today over the day's card, with the
/// way back to the planner.
struct DayPanelView: View {
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager
    @FocusState private var focus: String?
    private let panel = DayPanel.shared

    var body: some View {
        let day = panel.day ?? planner.today
        VStack(spacing: 10) {
            HStack(spacing: 4) {
                Spacer()
                if day != planner.today {
                    Button("Today") { withAnimation(Motion.standard) { panel.day = nil } }
                        .buttonStyle(PillButtonStyle())
                        .help("Back to today")
                }
                // Drop a task on an arrow to move it to that day.
                TitleBarButton(systemImage: "chevron.backward", help: "Previous Day (drop a task here to move it)") { step(-1, from: day) }
                    .dropDestination(for: String.self) { ids, _ in move(ids, to: DateKey.addDays(day, -1)) }
                TitleBarButton(systemImage: "chevron.forward", help: "Next Day (drop a task here to move it)") { step(1, from: day) }
                    .dropDestination(for: String.self) { ids, _ in move(ids, to: DateKey.addDays(day, 1)) }
                TitleBarButton(systemImage: "arrow.up.left.and.arrow.down.right", help: "Open the Planner") { panel.openPlanner() }
            }
            .padding(.top, 6)
            .padding(.horizontal, 8)
            .frame(height: 32)

            DayColumn(date: day, items: planner.filter.apply(store.days(from: day, to: day)[day] ?? []), focus: $focus, standalone: true)
                .padding(.horizontal, 10)
                .padding(.bottom, 10)
                .id(day)
                .transition(.opacity)
        }
        .frame(maxWidth: DayPanel.width, maxHeight: .infinity, alignment: .top)
        .background(Theme.background)
        .ignoresSafeArea(.container, edges: .top)
        .animation(Motion.standard, value: day)
        // A task opened here shows its sheet on the planner window.
        .onChange(of: planner.openTask?.id) { _, id in if id != nil { panel.openPlanner() } }
        .onChange(of: planner.focusRequest) { _, request in
            guard let request, request == day else { return }
            focus = request
        }
    }

    private func move(_ ids: [String], to day: String) -> Bool {
        guard let id = ids.first, store.item(id) != nil else { return false }
        store.perform("Move Task", undoManager: undoManager) { _ = store.move(id, to: day) }
        planner.show("Moved to \(Format.weekdayDate(day)).", canUndo: true)
        return true
    }

    private func step(_ days: Int, from day: String) {
        let next = DateKey.addDays(day, days)
        panel.day = next == planner.today ? nil : next
    }
}
