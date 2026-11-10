import AppKit
import SwiftUI

/// While a dialog (task, weekly review, command palette) is open over the
/// planner, a click on the planner behind it closes the dialog, like a
/// popover. Every edit is already saved as it is made, so closing loses
/// nothing. Clicks in the dialog, or in its own popovers and menus (their
/// own windows), are left alone.
private struct CloseOnOutsideClick: ViewModifier {
    var isOpen: Bool
    var close: () -> Void
    @State private var monitor: Any?

    func body(content: Content) -> some View {
        content
            .onChange(of: isOpen, initial: true) { _, open in open ? install() : remove() }
            .onDisappear(perform: remove)
    }

    private func install() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { event in
            MainActor.assumeIsolated {
                guard let main = TimerActions.mainWindow, main.attachedSheet != nil, event.window === main else { return event }
                close()
                // Swallowed: the planner would only beep behind a sheet.
                return nil
            }
        }
    }

    private func remove() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
    }
}

extension View {
    func closesDialogOnOutsideClick(isOpen: Bool, close: @escaping () -> Void) -> some View {
        modifier(CloseOnOutsideClick(isOpen: isOpen, close: close))
    }
}
