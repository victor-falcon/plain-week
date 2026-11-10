import AppKit
import SwiftUI

/// The notes field of the task sheet: plain text with light Markdown
/// (`NoteMarkdown`) styled live as you type, and the formatting keys of a
/// writing app. The keys act only while the notes have focus.
///
/// ⌘1–4 heading · ⌘T todo line · ⌘E time · ⇧⌘E date · ⇧⌘X strikethrough ·
/// ⌘B bold · ⌘I italic · ⌘U underline · ⇧⌘C text and highlight color ·
/// ⌥⌘B block caret (Vim style). A click on a todo box ticks it. Pasting or
/// dropping an image saves it to `attachments/` and shows it in the note
/// (`NoteImages`); a click on it opens it in Preview.
struct NotesEditor: NSViewRepresentable {
    @Binding var text: String
    /// Bump to give the editor keyboard focus.
    var focusTick: Int
    var onFocusChange: (Bool) -> Void = { _ in }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSScrollView {
        // TextKit 1: images are drawn from the layout manager's line rects.
        let textView = NoteTextView(usingTextLayoutManager: false)
        textView.delegate = context.coordinator
        textView.onFocusChange = { focused in context.coordinator.parent.onFocusChange(focused) }
        textView.isRichText = false
        textView.allowsUndo = true
        textView.drawsBackground = false
        // Monochrome: a black caret and a grey selection, not the system accent.
        textView.insertionPointColor = .labelColor
        textView.selectedTextAttributes = [.backgroundColor: NSColor.labelColor.withAlphaComponent(0.14)]
        textView.linkTextAttributes = [.foregroundColor: NSColor.labelColor,
                                       .underlineStyle: NSUnderlineStyle.single.rawValue,
                                       .underlineColor: NSColor.tertiaryLabelColor,
                                       .cursor: NSCursor.pointingHand]
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.textContainerInset = NSSize(width: 0, height: 2)
        textView.textContainer?.lineFragmentPadding = 4
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.textContainer?.widthTracksTextView = true
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.string = text
        NoteStyler.apply(to: textView)

        let scroll = NSScrollView()
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        scroll.autohidesScrollers = true
        scroll.documentView = textView
        context.coordinator.lastFocusTick = focusTick
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        context.coordinator.parent = self
        guard let textView = scroll.documentView as? NoteTextView else { return }
        if textView.string != text {
            textView.string = text
            NoteStyler.apply(to: textView)
        }
        if context.coordinator.lastFocusTick != focusTick {
            context.coordinator.lastFocusTick = focusTick
            DispatchQueue.main.async { textView.window?.makeFirstResponder(textView) }
        }
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: NotesEditor
        var lastFocusTick = 0

        init(_ parent: NotesEditor) { self.parent = parent }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            NoteStyler.apply(to: textView)
            if parent.text != textView.string { parent.text = textView.string }
        }

        /// Markers show only on the line being edited.
        func textViewDidChangeSelection(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView, !textView.hasMarkedText() else { return }
            let line = (textView.string as NSString).lineRange(for: NSRange(location: min(textView.selectedRange().location, (textView.string as NSString).length), length: 0))
            guard line != lastLine else { return }
            lastLine = line
            NoteStyler.apply(to: textView)
        }
        private var lastLine: NSRange?
    }
}

/// The text view: formatting keys, todo boxes, the color menu, block caret.
final class NoteTextView: NSTextView {
    static let blockCaretKey = "notesBlockCaret"
    var onFocusChange: ((Bool) -> Void)?

    private var blockCaret: Bool {
        get { UserDefaults.standard.bool(forKey: Self.blockCaretKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.blockCaretKey) }
    }

    override func becomeFirstResponder() -> Bool {
        let ok = super.becomeFirstResponder()
        if ok { onFocusChange?(true); NoteStyler.apply(to: self, editing: true) }
        return ok
    }

    override func resignFirstResponder() -> Bool {
        let ok = super.resignFirstResponder()
        if ok { onFocusChange?(false); NoteStyler.apply(to: self, editing: false) }
        return ok
    }

    // MARK: Keys

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard window?.firstResponder === self, event.type == .keyDown else { return super.performKeyEquivalent(with: event) }
        let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
        let key = event.charactersIgnoringModifiers?.lowercased() ?? ""

        // ⌘1–4 are fixed; the rest follow Settings › Shortcuts.
        if mods == [.command], let level = Int(key), (1...4).contains(level) {
            run { NoteMarkdown.toggleHeading($0, level: level) }
            return true
        }
        switch Shortcuts.shared.action(for: event, in: .notes) {
        case .todo: run(NoteMarkdown.toggleTodo)
        case .timeStamp: run { NoteMarkdown.insert($0, NoteMarkdown.timeStamp()) }
        case .dateStamp: run { NoteMarkdown.insert($0, NoteMarkdown.dateStamp()) }
        case .strike: run { NoteMarkdown.toggleWrap($0, .strike) }
        case .bold: run { NoteMarkdown.toggleWrap($0, .bold) }
        case .italic: run { NoteMarkdown.toggleWrap($0, .italic) }
        case .underline: run { NoteMarkdown.toggleWrap($0, .underline) }
        case .textColor: showColorMenu()
        case .blockCaret:
            blockCaret.toggle()
            updateInsertionPointStateAndRestartTimer(true)
            needsDisplay = true
        default:
            return super.performKeyEquivalent(with: event)
        }
        return true
    }

    /// Applies a command as one undoable edit.
    private func run(_ command: (NoteMarkdown.Edit) -> NoteMarkdown.Edit, actionName: String = "Format") {
        let before = NoteMarkdown.Edit(text: string, selection: selectedRange())
        let after = command(before)
        guard after != before else { return }
        replaceAll(with: after.text, actionName: actionName)
        setSelectedRange(after.selection)
    }

    private func replaceAll(with newText: String, actionName: String) {
        let full = NSRange(location: 0, length: (string as NSString).length)
        guard shouldChangeText(in: full, replacementString: newText) else { return }
        replaceCharacters(in: full, with: newText)
        didChangeText()
        undoManager?.setActionName(actionName)
    }

    // MARK: Images

    override func paste(_ sender: Any?) {
        let names = NoteImages.saveImages(from: .general)
        if names.isEmpty { super.paste(sender) } else { insertImages(names) }
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        let files = NoteImages.imageFileURLs(sender.draggingPasteboard)
        guard !files.isEmpty else { return super.performDragOperation(sender) }
        let names = files.compactMap { url in
            (try? Data(contentsOf: url)).flatMap { NoteImages.save($0, extension: url.pathExtension) }
        }
        guard !names.isEmpty else { return false }
        let index = characterIndexForInsertion(at: convert(sender.draggingLocation, from: nil))
        setSelectedRange(NSRange(location: min(index, (string as NSString).length), length: 0))
        window?.makeFirstResponder(self)
        insertImages(names)
        return true
    }

    private func insertImages(_ names: [String]) {
        run({ NoteImages.insert($0, names: names) }, actionName: names.count == 1 ? "Paste Image" : "Paste Images")
    }

    /// Where each image line's picture is drawn, in view coordinates.
    func imageRects() -> [(rect: NSRect, name: String)] {
        guard let layoutManager, let textContainer, let storage = textStorage else { return [] }
        var result: [(NSRect, String)] = []
        storage.enumerateAttribute(NoteStyler.imageKey, in: NSRange(location: 0, length: storage.length)) { value, range, _ in
            guard let name = value as? String else { return }
            let glyph = layoutManager.glyphIndexForCharacter(at: range.location)
            let fragment = layoutManager.lineFragmentRect(forGlyphAt: glyph, effectiveRange: nil)
            let size = NoteImages.displaySize(name, width: NoteStyler.imageWidth(textContainer))
            let origin = NSPoint(x: fragment.minX + textContainer.lineFragmentPadding + textContainerOrigin.x,
                                 y: fragment.minY + NoteStyler.imageGap + textContainerOrigin.y)
            result.append((NSRect(origin: origin, size: size), name))
        }
        return result
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        for (rect, name) in imageRects() where rect.intersects(dirtyRect) {
            let path = NSBezierPath(roundedRect: rect, xRadius: 6, yRadius: 6)
            if let image = NoteImages.image(name) {
                NSGraphicsContext.saveGraphicsState()
                path.addClip()
                image.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
                NSGraphicsContext.restoreGraphicsState()
                NSColor.separatorColor.setStroke()
                path.lineWidth = 0.5
                path.stroke()
            } else {
                NSColor.quaternaryLabelColor.setFill()
                path.fill()
                let label = "Image not found" as NSString
                let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 12), .foregroundColor: NSColor.secondaryLabelColor]
                let size = label.size(withAttributes: attributes)
                label.draw(at: NSPoint(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2), withAttributes: attributes)
            }
        }
    }

    override func setFrameSize(_ newSize: NSSize) {
        let widthChanged = newSize.width != frame.width
        super.setFrameSize(newSize)
        // Images fit the width, so their room changes with it.
        if widthChanged, textStorage?.length ?? 0 > 0 { NoteStyler.apply(to: self) }
    }

    // MARK: Todo boxes

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if let hit = imageRects().first(where: { $0.rect.contains(point) }), let url = NoteImages.url(hit.name),
           FileManager.default.fileExists(atPath: url.path) {
            NSWorkspace.shared.open(url)
            return
        }
        let index = characterIndexForInsertion(at: point)
        let ns = string as NSString
        if index <= ns.length {
            let line = ns.lineRange(for: NSRange(location: min(index, ns.length), length: 0))
            // The click landed on "- [ ]" of a todo line.
            if index - line.location <= 5, let toggled = NoteMarkdown.toggleTodoBox(string, at: index) {
                let selection = selectedRange()
                replaceAll(with: toggled, actionName: "Tick")
                setSelectedRange(selection)
                return
            }
        }
        super.mouseDown(with: event)
    }

    // MARK: Colors

    private func showColorMenu() {
        let menu = NSMenu(title: "Color")
        menu.addItem(NSMenuItem.sectionHeader(title: "Text color"))
        for name in NoteMarkdown.colorNames {
            let item = NSMenuItem(title: name.capitalized, action: #selector(applyTextColor(_:)), keyEquivalent: "")
            item.representedObject = name
            item.image = swatch(NoteStyler.textColor(name))
            item.target = self
            menu.addItem(item)
        }
        menu.addItem(.separator())
        menu.addItem(NSMenuItem.sectionHeader(title: "Highlight"))
        for name in NoteMarkdown.colorNames {
            let item = NSMenuItem(title: name.capitalized, action: #selector(applyHighlight(_:)), keyEquivalent: "")
            item.representedObject = name
            item.image = swatch(NoteStyler.highlightColor(name))
            item.target = self
            menu.addItem(item)
        }
        menu.addItem(.separator())
        let clear = NSMenuItem(title: "Remove Text Color", action: #selector(removeTextColor(_:)), keyEquivalent: "")
        clear.target = self
        menu.addItem(clear)

        var location = NSPoint(x: 0, y: 0)
        if let layoutManager, let container = textContainer {
            let glyph = layoutManager.glyphRange(forCharacterRange: NSRange(location: selectedRange().location, length: 0), actualCharacterRange: nil)
            let rect = layoutManager.boundingRect(forGlyphRange: glyph, in: container)
            location = NSPoint(x: rect.minX + textContainerOrigin.x, y: rect.maxY + textContainerOrigin.y + 4)
        }
        menu.popUp(positioning: nil, at: location, in: self)
    }

    @objc private func applyTextColor(_ sender: NSMenuItem) {
        guard let name = sender.representedObject as? String else { return }
        run { NoteMarkdown.setTextColor($0, name) }
    }

    @objc private func applyHighlight(_ sender: NSMenuItem) {
        guard let name = sender.representedObject as? String else { return }
        run { NoteMarkdown.setHighlight($0, name) }
    }

    @objc private func removeTextColor(_ sender: NSMenuItem) {
        run { NoteMarkdown.setTextColor($0, nil) }
    }

    private func swatch(_ color: NSColor) -> NSImage {
        let image = NSImage(size: NSSize(width: 12, height: 12), flipped: false) { rect in
            color.setFill()
            NSBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), xRadius: 3, yRadius: 3).fill()
            return true
        }
        image.isTemplate = false
        return image
    }

    // MARK: Block caret

    override func drawInsertionPoint(in rect: NSRect, color: NSColor, turnedOn flag: Bool) {
        guard blockCaret else { return super.drawInsertionPoint(in: rect, color: color, turnedOn: flag) }
        var block = rect
        block.size.width = caretWidth
        if flag {
            color.withAlphaComponent(0.45).setFill()
            block.fill()
        } else {
            setNeedsDisplay(block, avoidAdditionalLayout: true)
        }
    }

    override func setNeedsDisplay(_ invalidRect: NSRect, avoidAdditionalLayout flag: Bool) {
        var rect = invalidRect
        if blockCaret { rect.size.width += caretWidth }
        super.setNeedsDisplay(rect, avoidAdditionalLayout: flag)
    }

    /// The width of the character under the caret (a space at a line end).
    private var caretWidth: CGFloat {
        let font = (typingAttributes[.font] as? NSFont) ?? NSFont.systemFont(ofSize: NoteStyler.baseSize)
        let ns = string as NSString
        let location = selectedRange().location
        var character = " "
        if location < ns.length {
            let next = ns.substring(with: NSRange(location: location, length: 1))
            if next != "\n" { character = next }
        }
        return max(4, (character as NSString).size(withAttributes: [.font: font]).width)
    }
}

/// Live styling of the Markdown in notes. Markers stay in the text, dimmed.
enum NoteStyler {
    static let baseSize: CGFloat = 14
    /// Marks an image line's text with its file name, for drawing and clicks.
    static let imageKey = NSAttributedString.Key("plainWeekNoteImage")
    /// Room above and below a drawn image.
    static let imageGap: CGFloat = 4

    /// The width images may take in `container`.
    static func imageWidth(_ container: NSTextContainer) -> CGFloat {
        max(40, container.size.width - container.lineFragmentPadding * 2)
    }

    static func textColor(_ name: String) -> NSColor {
        TaskColor(rawValue: name).flatMap(Theme.checkbox).map { NSColor($0.ring) } ?? .labelColor
    }

    static func highlightColor(_ name: String) -> NSColor {
        let base = TaskColor(rawValue: name).flatMap(Theme.pill).map { NSColor($0.background) } ?? .systemYellow
        return base.withAlphaComponent(0.4)
    }

    private static func regex(_ pattern: String) -> NSRegularExpression {
        try! NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines])
    }

    private static let heading = regex(#"^(#{1,4}) (.*)$"#)
    private static let todo = regex(#"^(- \[( |x|X)\] )(.*)$"#)
    private static let bold = regex(#"(\*\*)(.+?)(\*\*)"#)
    private static let italic = regex(#"(?<![\w_])(_)(?!_)(.+?)(_)(?![\w_])"#)
    private static let underline = regex(#"(\+\+)(.+?)(\+\+)"#)
    private static let strike = regex(#"(~~)(.+?)(~~)"#)
    private static let links = try! NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue | NSTextCheckingResult.CheckingType.address.rawValue)
    private static let highlight = regex(#"(==(?:\{([a-z]+)\})?)(.+?)(==)"#)
    private static let color = regex(#"(\{([a-z]+)\})(.+?)(\{/\})"#)

    /// Styles the Markdown in place. Its markers (`**`, `_`, `++`, `~~`, `#`,
    /// `==`, `{red}`) are hidden except on the line with the caret, where
    /// they can be edited; while the notes are not being edited, all hide.
    static func apply(to textView: NSTextView, editing: Bool? = nil) {
        guard let storage = textView.textStorage else { return }
        let text = storage.string
        let full = NSRange(location: 0, length: (text as NSString).length)
        let isEditing = editing ?? (textView.window?.firstResponder === textView)
        let caretLine = isEditing
            ? (text as NSString).lineRange(for: NSRange(location: min(textView.selectedRange().location, full.length), length: 0))
            : nil
        var markers: [NSRange] = []
        let base = NSFont.systemFont(ofSize: baseSize)
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 3
        let marker = NSColor.tertiaryLabelColor

        storage.beginEditing()
        storage.setAttributes([.font: base, .foregroundColor: NSColor.labelColor, .paragraphStyle: paragraph], range: full)

        // Web addresses, email links and street addresses (in Maps) open
        // with a click (underlined, in the text's own color: no blue in a
        // monochrome app).
        for match in links.matches(in: text, range: full) {
            let url = match.resultType == .address
                ? Place.mapsURL((text as NSString).substring(with: match.range))
                : match.url
            guard let url else { continue }
            storage.addAttribute(.link, value: url, range: match.range)
        }

        for match in heading.matches(in: text, range: full) {
            let level = match.range(at: 1).length
            let size: CGFloat = [24, 20, 17, 15][min(level, 4) - 1]
            storage.addAttribute(.font, value: NSFont.systemFont(ofSize: size, weight: .bold), range: match.range)
            storage.addAttribute(.foregroundColor, value: marker, range: NSRange(location: match.range.location, length: level + 1))
            markers.append(NSRange(location: match.range.location, length: level + 1))
        }
        for match in todo.matches(in: text, range: full) {
            let box = match.range(at: 1)
            let done = (text as NSString).substring(with: match.range(at: 2)).lowercased() == "x"
            storage.addAttribute(.foregroundColor, value: done ? NSColor.labelColor : NSColor.secondaryLabelColor, range: box)
            storage.addAttribute(.font, value: NSFont.monospacedSystemFont(ofSize: baseSize - 1, weight: .medium), range: box)
            storage.addAttribute(.cursor, value: NSCursor.pointingHand, range: box)
            if done {
                storage.addAttributes([.strikethroughStyle: NSUnderlineStyle.single.rawValue,
                                       .foregroundColor: NSColor.secondaryLabelColor], range: match.range(at: 3))
            }
        }
        style(bold, in: storage, text: text, marker: marker, markers: &markers) { range in
            addTrait(.boldFontMask, to: storage, range: range)
        }
        style(italic, in: storage, text: text, marker: marker, markers: &markers) { range in
            addTrait(.italicFontMask, to: storage, range: range)
        }
        style(underline, in: storage, text: text, marker: marker, markers: &markers) { range in
            storage.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: range)
        }
        style(strike, in: storage, text: text, marker: marker, markers: &markers) { range in
            storage.addAttribute(.strikethroughStyle, value: NSUnderlineStyle.single.rawValue, range: range)
        }
        for match in highlight.matches(in: text, range: full) {
            let name = match.range(at: 2).location == NSNotFound ? "yellow" : (text as NSString).substring(with: match.range(at: 2))
            storage.addAttribute(.backgroundColor, value: highlightColor(name), range: match.range(at: 3))
            storage.addAttribute(.foregroundColor, value: marker, range: match.range(at: 1))
            storage.addAttribute(.foregroundColor, value: marker, range: match.range(at: 4))
            markers += [match.range(at: 1), match.range(at: 4)]
        }
        for match in color.matches(in: text, range: full) {
            let name = (text as NSString).substring(with: match.range(at: 2))
            storage.addAttribute(.foregroundColor, value: textColor(name), range: match.range(at: 3))
            storage.addAttribute(.foregroundColor, value: marker, range: match.range(at: 1))
            storage.addAttribute(.foregroundColor, value: marker, range: match.range(at: 4))
            markers += [match.range(at: 1), match.range(at: 4)]
        }
        // Off the caret's line, markers take no room and no color.
        let hidden: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 0.01), .foregroundColor: NSColor.clear]

        // Image lines: the picture is drawn in room made above the line
        // (`NoteTextView.draw`); the Markdown shows, small, only on the
        // caret's line, so it can be edited or deleted.
        let width = textView.textContainer.map(imageWidth) ?? 300
        for image in NoteImages.lines(in: text) {
            let size = NoteImages.displaySize(image.name, width: width)
            let style = NSMutableParagraphStyle()
            style.paragraphSpacingBefore = size.height + imageGap * 2
            storage.addAttributes([.paragraphStyle: style, imageKey: image.name], range: image.range)
            storage.removeAttribute(.link, range: image.range)
            if let caretLine, NSIntersectionRange(caretLine, image.range).length > 0 || NSLocationInRange(image.range.location, caretLine) {
                storage.addAttributes([.font: NSFont.systemFont(ofSize: 11), .foregroundColor: marker], range: image.range)
            } else {
                storage.addAttributes(hidden, range: image.range)
            }
        }
        for range in markers where range.location != NSNotFound && range.length > 0 {
            if let caretLine, NSIntersectionRange(caretLine, range).length > 0 || NSLocationInRange(range.location, caretLine) { continue }
            storage.addAttributes(hidden, range: range)
        }
        storage.endEditing()
        textView.typingAttributes = [.font: base, .foregroundColor: NSColor.labelColor, .paragraphStyle: paragraph]
    }

    /// Styles group 2 with `body` and dims the markers (groups 1 and 3).
    private static func style(_ regex: NSRegularExpression, in storage: NSTextStorage, text: String, marker: NSColor,
                              markers: inout [NSRange], body: (NSRange) -> Void) {
        for match in regex.matches(in: text, range: NSRange(location: 0, length: (text as NSString).length)) {
            body(match.range(at: 2))
            storage.addAttribute(.foregroundColor, value: marker, range: match.range(at: 1))
            storage.addAttribute(.foregroundColor, value: marker, range: match.range(at: 3))
            markers += [match.range(at: 1), match.range(at: 3)]
        }
    }

    private static func addTrait(_ trait: NSFontTraitMask, to storage: NSTextStorage, range: NSRange) {
        storage.enumerateAttribute(.font, in: range) { value, sub, _ in
            let font = (value as? NSFont) ?? NSFont.systemFont(ofSize: baseSize)
            storage.addAttribute(.font, value: NSFontManager.shared.convert(font, toHaveTrait: trait), range: sub)
        }
    }
}
