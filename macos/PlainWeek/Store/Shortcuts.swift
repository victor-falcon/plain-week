import AppKit
import SwiftUI

/// One key with its modifiers, as in "⌥⌘D".
struct KeyCombo: Codable, Equatable, Hashable {
    /// A lowercase character ("d", "/"), or a named key: return, delete,
    /// left, right, up, down, space, tab.
    var key: String
    var command = false
    var option = false
    var shift = false
    var control = false

    private static let namedKeys: [UInt16: String] = [
        36: "return", 76: "return", 51: "delete", 123: "left", 124: "right", 125: "down", 126: "up", 49: "space", 48: "tab",
    ]

    private static let symbols: [String: String] = [
        "return": "↩", "delete": "⌫", "left": "←", "right": "→", "up": "↑", "down": "↓", "space": "Space", "tab": "⇥",
    ]

    init(_ key: String, command: Bool = false, option: Bool = false, shift: Bool = false, control: Bool = false) {
        self.key = key
        self.command = command
        self.option = option
        self.shift = shift
        self.control = control
    }

    /// The combo of a key-down event, or nil for a key that cannot be one
    /// (function keys, Escape, a modifier alone).
    init?(event: NSEvent) {
        let flags = event.modifierFlags.intersection([.command, .option, .shift, .control])
        if let named = Self.namedKeys[event.keyCode] {
            key = named
        } else if let base = event.characters(byApplyingModifiers: [])?.lowercased(), base.count == 1,
                  let scalar = base.unicodeScalars.first, scalar.value > 32, scalar.value != 127,
                  !(0xF700...0xF8FF).contains(scalar.value) {
            key = base
        } else {
            return nil
        }
        command = flags.contains(.command)
        option = flags.contains(.option)
        shift = flags.contains(.shift)
        control = flags.contains(.control)
    }

    /// "⌥⌘D": modifiers in the system's order, then the key.
    var display: String {
        (control ? "⌃" : "") + (option ? "⌥" : "") + (shift ? "⇧" : "") + (command ? "⌘" : "")
            + (Self.symbols[key] ?? key.uppercased())
    }

    var keyEquivalent: KeyEquivalent {
        switch key {
        case "return": .return
        case "delete": .delete
        case "left": .leftArrow
        case "right": .rightArrow
        case "up": .upArrow
        case "down": .downArrow
        case "space": .space
        case "tab": .tab
        default: KeyEquivalent(key.first ?? " ")
        }
    }

    var eventModifiers: EventModifiers {
        var modifiers: EventModifiers = []
        if command { modifiers.insert(.command) }
        if option { modifiers.insert(.option) }
        if shift { modifiers.insert(.shift) }
        if control { modifiers.insert(.control) }
        return modifiers
    }
}

/// Where a shortcut works: anywhere in the task window, or in its notes.
enum ShortcutGroup: String, CaseIterable, Identifiable {
    case task, notes
    var id: String { rawValue }

    var title: String { self == .task ? "Task window" : "Notes" }

    var explanation: String {
        switch self {
        case .task: "These work anywhere in the task window, even while you type."
        case .notes: "These work while the cursor is in the notes."
        }
    }

    var actions: [ShortcutAction] { ShortcutAction.allCases.filter { $0.group == self } }

    /// Keys that cannot be changed, listed with the others.
    var fixed: [(keys: String, title: String)] {
        switch self {
        case .task: [("⌥⌘0–3", "Priority: none to high"), ("⌫", "Delete, when not typing"), ("Esc", "Close the window")]
        case .notes: [("⌘1–4", "Heading 1 to 4")]
        }
    }
}

/// Every shortcut of the task window that the user can change.
enum ShortcutAction: String, CaseIterable, Identifiable {
    case date, time, location, flag, tags, repeating, color, expand, done, delete, tomorrow, nextWeek, backlog, duplicate, shortcuts
    case bold, italic, underline, strike, todo, timeStamp, dateStamp, textColor, blockCaret

    var id: String { rawValue }

    var group: ShortcutGroup {
        switch self {
        case .bold, .italic, .underline, .strike, .todo, .timeStamp, .dateStamp, .textColor, .blockCaret: .notes
        default: .task
        }
    }

    var title: String {
        switch self {
        case .date: "Date"
        case .time: "Time"
        case .location: "Location"
        case .flag: "Flag"
        case .tags: "Tags"
        case .repeating: "Repeat"
        case .color: "Color"
        case .expand: "Larger or smaller window"
        case .done: "Mark as done"
        case .delete: "Delete"
        case .tomorrow: "Move to tomorrow"
        case .nextWeek: "Move to next week"
        case .backlog: "Move to the Backlog"
        case .duplicate: "Duplicate"
        case .shortcuts: "Show these shortcuts"
        case .bold: "Bold"
        case .italic: "Italic"
        case .underline: "Underline"
        case .strike: "Strikethrough"
        case .todo: "To-do line"
        case .timeStamp: "Insert the time"
        case .dateStamp: "Insert the date"
        case .textColor: "Text color or highlight"
        case .blockCaret: "Block caret"
        }
    }

    /// One line on what the key does, for Settings.
    var detail: String {
        switch self {
        case .date: "Opens the date picker."
        case .time: "Opens the time picker."
        case .location: "Opens the place search."
        case .flag: "Flags the task, or removes its flag."
        case .tags: "Puts the cursor in the tags field."
        case .repeating: "Opens the repeat options."
        case .color: "Opens the colors; then 1–9 picks one."
        case .expand: "Switches between the small and the large window."
        case .done: "Ticks the task, or unticks it."
        case .delete: "Deletes the task, even while you type."
        case .tomorrow: "Moves the task to tomorrow."
        case .nextWeek: "Moves the task a week ahead."
        case .backlog: "Removes the task's date."
        case .duplicate: "Adds a copy below the task."
        case .shortcuts: "Opens the list of keys beside the task."
        case .bold: "Wraps the selection in **bold**."
        case .italic: "Wraps the selection in *italic*."
        case .underline: "Underlines the selection."
        case .strike: "Strikes the selection through."
        case .todo: "Turns the line into a to-do, and back."
        case .timeStamp: "Types the time, like 14:30."
        case .dateStamp: "Types today's date."
        case .textColor: "Opens the menu of text colors and highlights."
        case .blockCaret: "Switches the caret between a line and a block."
        }
    }

    var defaultCombo: KeyCombo {
        switch self {
        case .date: KeyCombo("d", command: true, option: true)
        case .time: KeyCombo("t", command: true, option: true)
        case .location: KeyCombo("p", command: true, option: true)
        case .flag: KeyCombo("f", command: true, option: true)
        case .tags: KeyCombo("g", command: true, option: true)
        case .repeating: KeyCombo("r", command: true, option: true)
        case .color: KeyCombo("c", command: true, option: true)
        case .expand: KeyCombo("e", command: true, option: true)
        case .done: KeyCombo("return", command: true)
        case .delete: KeyCombo("delete", command: true, shift: true)
        case .tomorrow: KeyCombo("right", command: true, option: true)
        case .nextWeek: KeyCombo("right", command: true, option: true, shift: true)
        case .backlog: KeyCombo("l", command: true, option: true)
        case .duplicate: KeyCombo("d", command: true)
        case .shortcuts: KeyCombo("/", command: true)
        case .bold: KeyCombo("b", command: true)
        case .italic: KeyCombo("i", command: true)
        case .underline: KeyCombo("u", command: true)
        case .strike: KeyCombo("x", command: true, shift: true)
        case .todo: KeyCombo("t", command: true)
        case .timeStamp: KeyCombo("e", command: true)
        case .dateStamp: KeyCombo("e", command: true, shift: true)
        case .textColor: KeyCombo("c", command: true, shift: true)
        case .blockCaret: KeyCombo("b", command: true, option: true)
        }
    }
}

/// The task window's shortcuts: the defaults, with the user's changes from
/// Settings › Shortcuts on top (kept in UserDefaults).
@MainActor
@Observable
final class Shortcuts {
    static let shared = Shortcuts()
    static let storageKey = "keyboardShortcuts"

    /// Why a combo cannot be used.
    enum Problem: Equatable {
        case needsCommand
        case reserved
        case taken(String)

        var message: String {
            switch self {
            case .needsCommand: "Use ⌘ or ⌃ in the shortcut, so it works while you type."
            case .reserved: "macOS uses that one (copy, paste, undo, quit and the like)."
            case .taken(let title): "Already used by “\(title)”."
            }
        }
    }

    /// The user's changes, by action.
    private(set) var custom: [String: KeyCombo]
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let data = defaults.data(forKey: Self.storageKey)
        custom = data.flatMap { try? JSONDecoder().decode([String: KeyCombo].self, from: $0) } ?? [:]
    }

    func combo(_ action: ShortcutAction) -> KeyCombo { custom[action.rawValue] ?? action.defaultCombo }

    /// "⌥⌘D", for tooltips and lists.
    func label(_ action: ShortcutAction) -> String { combo(action).display }

    func isCustom(_ action: ShortcutAction) -> Bool { custom[action.rawValue] != nil }

    var hasChanges: Bool { !custom.isEmpty }

    /// Editing keys of macOS and the app's own fixed keys, which stay as they are.
    private static let reserved: Set<KeyCombo> = {
        var set: Set<KeyCombo> = [
            KeyCombo("z", command: true, shift: true), KeyCombo(",", command: true),
        ]
        for key in ["c", "v", "x", "z", "a", "q", "w", "h", "m"] { set.insert(KeyCombo(key, command: true)) }
        for key in ["0", "1", "2", "3"] { set.insert(KeyCombo(key, command: true, option: true)) }
        for key in ["1", "2", "3", "4"] { set.insert(KeyCombo(key, command: true)) }
        return set
    }()

    /// What is wrong with `combo` for `action`, if anything.
    func problem(with combo: KeyCombo, for action: ShortcutAction) -> Problem? {
        guard combo.command || combo.control else { return .needsCommand }
        if Self.reserved.contains(combo) { return .reserved }
        if let other = ShortcutAction.allCases.first(where: { $0 != action && self.combo($0) == combo }) {
            return .taken(other.title)
        }
        return nil
    }

    /// Changes a shortcut; refused (and returned) when there is a problem.
    @discardableResult
    func set(_ combo: KeyCombo, for action: ShortcutAction) -> Problem? {
        if let problem = problem(with: combo, for: action) { return problem }
        if combo == action.defaultCombo { custom[action.rawValue] = nil } else { custom[action.rawValue] = combo }
        save()
        return nil
    }

    /// Back to the default. Another action that had taken that default goes
    /// back to its own, so no two share a key.
    func reset(_ action: ShortcutAction) {
        custom[action.rawValue] = nil
        for other in ShortcutAction.allCases where other != action && combo(other) == action.defaultCombo {
            custom[other.rawValue] = nil
        }
        save()
    }

    func resetAll() {
        custom = [:]
        save()
    }

    /// The action of `group` that a key-down event asks for.
    func action(for event: NSEvent, in group: ShortcutGroup) -> ShortcutAction? {
        guard let combo = KeyCombo(event: event) else { return nil }
        return action(for: combo, in: group)
    }

    func action(for combo: KeyCombo, in group: ShortcutGroup) -> ShortcutAction? {
        group.actions.first { self.combo($0) == combo }
    }

    private func save() {
        if custom.isEmpty {
            defaults.removeObject(forKey: Self.storageKey)
        } else if let data = try? JSONEncoder().encode(custom) {
            defaults.set(data, forKey: Self.storageKey)
        }
    }
}

extension View {
    /// The action's current shortcut (Settings › Shortcuts can change it).
    @MainActor
    func shortcut(_ action: ShortcutAction) -> some View {
        let combo = Shortcuts.shared.combo(action)
        return keyboardShortcut(combo.keyEquivalent, modifiers: combo.eventModifiers)
    }
}
