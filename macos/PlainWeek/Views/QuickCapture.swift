import AppKit
import Carbon.HIToolbox
import SwiftUI

/// Quick capture: a global ⌥Space (from any app, no permission needed) opens
/// a small floating field. It reads the same natural typing as a new-task row
/// ("tomorrow call Joao @11:30 #yellow daily"); Return adds the task to today
/// (or the day typed) and closes, Esc closes.
@MainActor
final class QuickCapture {
    static let shared = QuickCapture()
    static let enabledKey = "quickCaptureHotKey"
    static var hotKeyEnabled: Bool { UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true }

    private var panel: NSPanel?
    private var hotKey: EventHotKeyRef?
    private var handler: EventHandlerRef?

    /// Registers ⌥Space (or removes it when turned off in Settings).
    func registerHotKey() {
        unregisterHotKey()
        guard Self.hotKeyEnabled else { return }
        var type = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, _, _ in
            DispatchQueue.main.async { QuickCapture.shared.toggle() }
            return noErr
        }, 1, &type, nil, &handler)
        let id = EventHotKeyID(signature: OSType(0x504C574B) /* PLWK */, id: 1)
        RegisterEventHotKey(UInt32(kVK_Space), UInt32(optionKey), id, GetApplicationEventTarget(), 0, &hotKey)
    }

    func unregisterHotKey() {
        if let hotKey { UnregisterEventHotKey(hotKey) }
        if let handler { RemoveEventHandler(handler) }
        hotKey = nil
        handler = nil
    }

    func toggle() { panel?.isVisible == true ? close() : show() }

    func show() {
        if panel == nil {
            let panel = CapturePanel(contentRect: NSRect(x: 0, y: 0, width: 560, height: 64),
                                     styleMask: [.titled, .fullSizeContentView],
                                     backing: .buffered, defer: false)
            panel.titleVisibility = .hidden
            panel.titlebarAppearsTransparent = true
            [.closeButton, .miniaturizeButton, .zoomButton].forEach { panel.standardWindowButton($0)?.isHidden = true }
            panel.level = .floating
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            panel.isMovableByWindowBackground = true
            panel.isOpaque = false
            panel.backgroundColor = .clear
            panel.hasShadow = true
            panel.isReleasedWhenClosed = false
            let model = AppModel.shared
            panel.contentView = NSHostingView(rootView: QuickCaptureView { QuickCapture.shared.close() }
                .environment(model.store)
                .environment(model.planner)
                .tint(Theme.foreground))
            self.panel = panel
        }
        guard let panel else { return }
        // Centred in the upper third of the screen with the pointer, like Spotlight.
        let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main
        if let visible = screen?.visibleFrame {
            panel.setFrameOrigin(NSPoint(x: visible.midX - panel.frame.width / 2, y: visible.maxY - visible.height / 3))
        }
        panel.alphaValue = 0
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.15
            panel.animator().alphaValue = 1
        }
        NotificationCenter.default.post(name: .quickCaptureShown, object: nil)
    }

    func close() {
        guard let panel, panel.isVisible else { return }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.12
            panel.animator().alphaValue = 0
        } completionHandler: {
            panel.orderOut(nil)
        }
    }
}

extension Notification.Name {
    static let quickCaptureShown = Notification.Name("plainweek.quickCaptureShown")
}

/// A floating panel that can take keyboard focus (for typing).
private final class CapturePanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

struct QuickCaptureView: View {
    var onClose: () -> Void
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        let quick = QuickAdd.parse(text, today: planner.today)
        HStack(spacing: 12) {
            Image(systemName: "plus.circle.fill")
                .font(.system(size: 20))
                .foregroundStyle(Theme.foreground)
            TextField("", text: $text, prompt: Text("New task · tomorrow call Joao @11:30 #yellow daily"))
                .textFieldStyle(.plain)
                .font(.system(size: 18, weight: .medium))
                .focused($focused)
                .onSubmit(add)
                .onExitCommand { text = ""; onClose() }
            if quick.hasExtras, !text.isEmpty {
                QuickPreview(quick: quick, listDate: planner.today, today: planner.today)
            }
        }
        .padding(.horizontal, 18)
        .frame(width: 560, height: 64)
        .floatingMaterial(in: RoundedRectangle(cornerRadius: Theme.panelRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.panelRadius, style: .continuous).strokeBorder(Theme.border))
        .onReceive(NotificationCenter.default.publisher(for: .quickCaptureShown)) { _ in
            DispatchQueue.main.async { focused = true }
        }
    }

    private func add() {
        let quick = QuickAdd.parse(text, today: planner.today)
        guard !quick.text.isEmpty else { onClose(); return }
        let target = quick.targetDate(listDate: planner.today, today: planner.today)
        let undo = TimerActions.mainWindow?.undoManager
        store.perform("New Task", undoManager: undo) {
            let id = store.create(text: quick.text, date: target, time: quick.time, duration: quick.duration, location: quick.location, tags: quick.tags, priority: quick.priority, color: quick.color ?? .none, project: planner.projectId)
            if let spec = quick.repeatSpec, let anchor = target { _ = try? store.setRecurrence(id, spec.rule(anchor: anchor)) }
        }
        planner.show(target.map { "Added to \(DoneList.dayLabel($0, today: planner.today))" } ?? "Added to Backlog", canUndo: undo != nil)
        text = ""
        onClose()
    }
}
