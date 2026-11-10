import Foundation

/// Formatting in task notes. Notes stay plain text (the sync contract and the
/// web app treat them as such), so formatting is written as light Markdown:
///
/// | Style          | Text                  | Key  |
/// | -------------- | --------------------- | ---- |
/// | Heading 1–4    | `# `, `## `, …        | ⌘1–4 |
/// | Todo line      | `- [ ] ` / `- [x] `   | ⌘T   |
/// | Bold           | `**text**`            | ⌘B   |
/// | Italic         | `_text_`              | ⌘I   |
/// | Underline      | `++text++`            | ⌘U   |
/// | Strikethrough  | `~~text~~`            | ⇧⌘X  |
/// | Highlight      | `==text==`, `=={green}text==` | ⇧⌘C |
/// | Text color     | `{red}text{/}`        | ⇧⌘C  |
/// | Image          | `![](attachments/…)`  | ⌘V   |
///
/// The editor shows these styled as you type; the web app shows the raw text.
/// Every command is a pure function from (text, selection) to (text, selection)
/// so it can be tested and undone as one step.
enum NoteMarkdown {
    struct Edit: Equatable {
        var text: String
        /// UTF-16 range, as `NSTextView` uses.
        var selection: NSRange
    }

    enum Wrap: String, CaseIterable {
        case bold = "**", italic = "_", underline = "++", strike = "~~", highlight = "=="
    }

    /// Colors offered for text and highlights (task color names).
    static let colorNames = ["red", "orange", "yellow", "green", "cornflower", "lilac", "pink", "grey"]

    // MARK: Lines

    /// The UTF-16 range of the lines the selection touches (without the final newline).
    static func lineRange(in text: String, for selection: NSRange) -> NSRange {
        let ns = text as NSString
        var range = ns.lineRange(for: selection)
        if range.length > 0, NSMaxRange(range) <= ns.length,
           ns.substring(with: NSRange(location: NSMaxRange(range) - 1, length: 1)) == "\n" {
            range.length -= 1
        }
        return range
    }

    private static let headingPrefix = try! NSRegularExpression(pattern: #"^#{1,6} "#)
    private static let todoPrefix = try! NSRegularExpression(pattern: #"^- \[( |x|X)\] "#)

    private static func prefixLength(_ regex: NSRegularExpression, _ line: String) -> Int {
        regex.firstMatch(in: line, range: NSRange(location: 0, length: (line as NSString).length))?.range.length ?? 0
    }

    /// Applies `transform` to every line the selection touches; the selection
    /// follows the change on its first line.
    private static func mapLines(_ edit: Edit, _ transform: (String) -> String) -> Edit {
        let ns = edit.text as NSString
        let range = lineRange(in: edit.text, for: edit.selection)
        let lines = ns.substring(with: range).components(separatedBy: "\n")
        let changed = lines.map(transform)
        let replacement = changed.joined(separator: "\n")
        let text = ns.replacingCharacters(in: range, with: replacement)
        guard edit.selection.length == 0 else {
            // A multi-line selection selects the changed lines.
            return Edit(text: text, selection: NSRange(location: range.location, length: (replacement as NSString).length))
        }
        // A caret keeps its place in the text of its line.
        let delta = (changed[0] as NSString).length - (lines[0] as NSString).length
        return Edit(text: text, selection: NSRange(location: max(range.location, edit.selection.location + delta), length: 0))
    }

    /// ⌘1–4: makes the lines a heading of `level`, or plain again when they
    /// already are one of that level.
    static func toggleHeading(_ edit: Edit, level: Int) -> Edit {
        let marker = String(repeating: "#", count: level) + " "
        let ns = edit.text as NSString
        let firstLine = ns.substring(with: ns.lineRange(for: NSRange(location: edit.selection.location, length: 0)))
        let isSame = firstLine.hasPrefix(marker)
        return mapLines(edit) { line in
            let body = (line as NSString).substring(from: prefixLength(headingPrefix, line))
            return isSame ? body : marker + body
        }
    }

    /// ⌘T: makes the lines todo lines, or plain again when they already are.
    static func toggleTodo(_ edit: Edit) -> Edit {
        let ns = edit.text as NSString
        let firstLine = ns.substring(with: ns.lineRange(for: NSRange(location: edit.selection.location, length: 0)))
        let isTodo = prefixLength(todoPrefix, firstLine) > 0
        return mapLines(edit) { line in
            let body = (line as NSString).substring(from: prefixLength(todoPrefix, line))
            return isTodo ? body : "- [ ] " + body
        }
    }

    /// Ticks or unticks the todo box of the line at `location` (a click on it).
    static func toggleTodoBox(_ text: String, at location: Int) -> String? {
        let ns = text as NSString
        let line = ns.lineRange(for: NSRange(location: min(location, ns.length), length: 0))
        let content = ns.substring(with: line)
        guard prefixLength(todoPrefix, content) > 0 else { return nil }
        let box = NSRange(location: line.location + 3, length: 1)
        let mark = ns.substring(with: box) == " " ? "x" : " "
        return ns.replacingCharacters(in: box, with: mark)
    }

    // MARK: Inline

    /// ⌘B, ⌘I, ⌘U, ⇧⌘X, highlight: wraps the selection in the marker, or
    /// unwraps it when it is already wrapped. With no selection it inserts an
    /// empty pair with the caret inside.
    static func toggleWrap(_ edit: Edit, _ wrap: Wrap) -> Edit {
        wrapSelection(edit, open: wrap.rawValue, close: wrap.rawValue)
    }

    /// Text color `{red}text{/}` (nil removes any color from the selection).
    static func setTextColor(_ edit: Edit, _ color: String?) -> Edit {
        var cleaned = removeColor(edit)
        guard let color else { return cleaned }
        cleaned = wrapSelection(cleaned, open: "{\(color)}", close: "{/}", toggle: false)
        return cleaned
    }

    /// Highlight `=={green}text==` (yellow is plain `==text==`).
    static func setHighlight(_ edit: Edit, _ color: String) -> Edit {
        let open = color == "yellow" ? "==" : "=={\(color)}"
        return wrapSelection(edit, open: open, close: "==", toggle: false)
    }

    private static func wrapSelection(_ edit: Edit, open: String, close: String, toggle: Bool = true) -> Edit {
        let ns = edit.text as NSString
        let o = (open as NSString).length, c = (close as NSString).length
        let sel = edit.selection
        let selected = ns.substring(with: sel)

        if toggle {
            // Selection includes the markers: "**bold**" → "bold".
            if selected.hasPrefix(open), selected.hasSuffix(close), (selected as NSString).length >= o + c {
                let inner = (selected as NSString).substring(with: NSRange(location: o, length: (selected as NSString).length - o - c))
                return Edit(text: ns.replacingCharacters(in: sel, with: inner),
                            selection: NSRange(location: sel.location, length: (inner as NSString).length))
            }
            // Markers just outside the selection: **[bold]** → bold.
            if sel.location >= o, NSMaxRange(sel) + c <= ns.length,
               ns.substring(with: NSRange(location: sel.location - o, length: o)) == open,
               ns.substring(with: NSRange(location: NSMaxRange(sel), length: c)) == close {
                let outer = NSRange(location: sel.location - o, length: sel.length + o + c)
                return Edit(text: ns.replacingCharacters(in: outer, with: selected),
                            selection: NSRange(location: sel.location - o, length: sel.length))
            }
        }
        let text = ns.replacingCharacters(in: sel, with: open + selected + close)
        return Edit(text: text, selection: NSRange(location: sel.location + o, length: sel.length))
    }

    private static let colorSpan = try! NSRegularExpression(pattern: #"\{([a-z]+)\}(.*?)\{/\}"#)

    private static func removeColor(_ edit: Edit) -> Edit {
        let ns = edit.text as NSString
        let line = lineRange(in: edit.text, for: edit.selection)
        var text = edit.text
        var selection = edit.selection
        for match in colorSpan.matches(in: edit.text, range: line).reversed() {
            let inner = match.range(at: 2)
            guard NSIntersectionRange(match.range, edit.selection).length > 0 || NSLocationInRange(edit.selection.location, match.range) else { continue }
            text = (text as NSString).replacingCharacters(in: match.range, with: ns.substring(with: inner))
            if selection.location > match.range.location { selection.location -= inner.location - match.range.location }
            if selection.location > NSMaxRange(inner) { selection.location -= 3 }
        }
        return Edit(text: text, selection: selection)
    }

    // MARK: Insert

    /// ⌘E / ⇧⌘E: inserts text at the caret, replacing the selection.
    static func insert(_ edit: Edit, _ string: String) -> Edit {
        let text = (edit.text as NSString).replacingCharacters(in: edit.selection, with: string)
        return Edit(text: text, selection: NSRange(location: edit.selection.location + (string as NSString).length, length: 0))
    }

    static func timeStamp(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }

    static func dateStamp(_ date: Date = Date()) -> String {
        Format.fullDate(DateKey.local(date))
    }
}
