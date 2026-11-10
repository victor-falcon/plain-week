import AppKit
import UniformTypeIdentifiers

/// Images in task notes. Notes stay plain text, so a pasted or dropped image
/// is saved as its own file in `attachments/`, next to `tasks.json`, and the
/// note gets a Markdown line pointing at it: `![](attachments/<uuid>.png)`.
/// The editor draws that line as the image; the web app shows the raw line.
/// Files are never deleted automatically, so undo and other Macs keep working.
enum NoteImages {
    static let folderName = "attachments"
    /// Wider images are scaled down before they are saved.
    static let maxPixelWidth = 2400
    /// Formats kept as they are when they are small enough.
    static let keptExtensions: Set<String> = ["png", "jpg", "jpeg", "gif", "heic", "webp"]

    /// A whole line `![alt](attachments/name.ext)`; group 1 is the file name.
    static let line = try! NSRegularExpression(
        pattern: #"^!\[[^\]\n]*\]\(attachments/([A-Za-z0-9._-]+)\)[ \t]*$"#, options: [.anchorsMatchLines])

    static func markdown(_ name: String) -> String { "![](\(folderName)/\(name))" }

    /// The app's attachments folder (created on first use).
    static func folder() -> URL? {
        guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let dir = support.appendingPathComponent("Plain Week/\(folderName)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func url(_ name: String, in folder: URL? = NoteImages.folder()) -> URL? {
        folder?.appendingPathComponent(name)
    }

    /// The image lines of `text`: each line's UTF-16 range (without its
    /// newline) and file name.
    static func lines(in text: String) -> [(range: NSRange, name: String)] {
        let ns = text as NSString
        return line.matches(in: text, range: NSRange(location: 0, length: ns.length)).map {
            ($0.range, ns.substring(with: $0.range(at: 1)))
        }
    }

    // MARK: Inserting

    /// Replaces the selection with one image line per name, each on a line of
    /// its own; the caret lands after them.
    static func insert(_ edit: NoteMarkdown.Edit, names: [String]) -> NoteMarkdown.Edit {
        guard !names.isEmpty else { return edit }
        let ns = edit.text as NSString
        let start = edit.selection.location, end = NSMaxRange(edit.selection)
        var block = names.map(markdown).joined(separator: "\n")
        if start > 0, ns.character(at: start - 1) != 10 { block = "\n" + block }
        let atLineEnd = end < ns.length && ns.character(at: end) == 10
        let caretOffset = (block as NSString).length + 1
        if !atLineEnd { block += "\n" }
        let text = ns.replacingCharacters(in: edit.selection, with: block)
        let caret = min(start + caretOffset, (text as NSString).length)
        return NoteMarkdown.Edit(text: text, selection: NSRange(location: caret, length: 0))
    }

    // MARK: Saving

    /// Saves image data under a new name; returns the name. Images wider than
    /// `maxPixelWidth` are scaled down; photos are stored as JPEG, the rest as PNG.
    static func save(_ data: Data, extension ext: String?, in folder: URL? = NoteImages.folder()) -> String? {
        guard let folder, let rep = NSBitmapImageRep(data: data) else { return nil }
        let id = UUID().uuidString.lowercased()
        let ext = ext?.lowercased()
        if let ext, keptExtensions.contains(ext), rep.pixelsWide <= maxPixelWidth {
            let name = "\(id).\(ext)"
            return (try? data.write(to: folder.appendingPathComponent(name), options: .atomic)) != nil ? name : nil
        }
        let ext2 = !rep.hasAlpha && ext != "png" ? "jpg" : "png"
        var image = rep.pixelsWide > maxPixelWidth ? scaled(rep, toWidth: maxPixelWidth) : rep
        if ext2 == "jpg", image.hasAlpha { image = opaqueCopy(image) }
        guard let encoded = image.representation(using: ext2 == "jpg" ? .jpeg : .png,
                                                 properties: ext2 == "jpg" ? [.compressionFactor: 0.85] : [:]) else { return nil }
        let name = "\(id).\(ext2)"
        return (try? encoded.write(to: folder.appendingPathComponent(name), options: .atomic)) != nil ? name : nil
    }

    private static func scaled(_ rep: NSBitmapImageRep, toWidth width: Int) -> NSBitmapImageRep {
        let height = max(1, Int((Double(rep.pixelsHigh) * Double(width) / Double(rep.pixelsWide)).rounded()))
        guard let out = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
                                         samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                                         bytesPerRow: 0, bitsPerPixel: 0) else { return rep }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: out)
        NSGraphicsContext.current?.imageInterpolation = .high
        rep.draw(in: NSRect(x: 0, y: 0, width: width, height: height), from: .zero, operation: .copy,
                 fraction: 1, respectFlipped: false, hints: nil)
        NSGraphicsContext.restoreGraphicsState()
        // Keep the original's point size, so a Retina screenshot stays as wide on screen.
        out.size = NSSize(width: rep.size.width * CGFloat(width) / CGFloat(rep.pixelsWide),
                          height: rep.size.height * CGFloat(width) / CGFloat(rep.pixelsWide))
        return out
    }

    /// The scaled copy is drawn with an alpha channel; a photo has none.
    private static func opaqueCopy(_ rep: NSBitmapImageRep) -> NSBitmapImageRep {
        guard let cg = rep.cgImage,
              let ctx = CGContext(data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
        else { return rep }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        guard let flat = ctx.makeImage() else { return rep }
        let out = NSBitmapImageRep(cgImage: flat)
        out.size = rep.size
        return out
    }

    /// Image files on a pasteboard (Finder copies, drags).
    static func imageFileURLs(_ pasteboard: NSPasteboard) -> [URL] {
        let options: [NSPasteboard.ReadingOptionKey: Any] = [
            .urlReadingFileURLsOnly: true,
            .urlReadingContentsConformToTypes: [UTType.image.identifier],
        ]
        return pasteboard.readObjects(forClasses: [NSURL.self], options: options) as? [URL] ?? []
    }

    /// Saves the images on `pasteboard` and returns their names: image files
    /// first, then image data (a screenshot, "Copy Image"). Text wins over
    /// image data, so a copy from a rich text app still pastes its text.
    static func saveImages(from pasteboard: NSPasteboard, in folder: URL? = NoteImages.folder()) -> [String] {
        let files = imageFileURLs(pasteboard)
        if !files.isEmpty {
            return files.compactMap { url in
                (try? Data(contentsOf: url)).flatMap { save($0, extension: url.pathExtension, in: folder) }
            }
        }
        if let text = pasteboard.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines),
           !text.isEmpty, !(text.hasPrefix("http") && !text.contains(where: \.isWhitespace)) {
            return []
        }
        let types: [(NSPasteboard.PasteboardType, String)] = [
            (.png, "png"), (NSPasteboard.PasteboardType(UTType.jpeg.identifier), "jpg"),
            (NSPasteboard.PasteboardType(UTType.heic.identifier), "heic"), (.tiff, "tiff"),
        ]
        for (type, ext) in types {
            if let data = pasteboard.data(forType: type), let name = save(data, extension: ext, in: folder) { return [name] }
        }
        return []
    }

    // MARK: Showing

    private static let cache = NSCache<NSString, NSImage>()

    static func image(_ name: String) -> NSImage? {
        if let cached = cache.object(forKey: name as NSString) { return cached }
        guard let url = url(name), let image = NSImage(contentsOf: url) else { return nil }
        cache.setObject(image, forKey: name as NSString)
        return image
    }

    /// The size an image is drawn at in a note `width` points wide: its own
    /// size, at most that wide and 320 points tall. A missing file gets a
    /// short placeholder.
    static func displaySize(_ name: String, width: CGFloat) -> NSSize {
        guard let image = image(name), image.size.width > 0, image.size.height > 0 else {
            return NSSize(width: min(width, 220), height: 44)
        }
        var size = image.size
        let scale = min(1, max(40, width) / size.width, 320 / size.height)
        size.width *= scale
        size.height *= scale
        return NSSize(width: size.width.rounded(), height: size.height.rounded())
    }

    // MARK: Sync

    /// Copies attachments both ways between this Mac's folder and the sync
    /// folder's `attachments/`: each side gets the files it lacks. Nothing is
    /// deleted. Returns how many files arrived here.
    @discardableResult
    static func sync(local: URL, shared: URL) -> Int {
        let fm = FileManager.default
        try? fm.createDirectory(at: local, withIntermediateDirectories: true)
        try? fm.createDirectory(at: shared, withIntermediateDirectories: true)
        let mine = Set((try? fm.contentsOfDirectory(atPath: local.path)) ?? []).filter { !$0.hasPrefix(".") }
        var theirs: Set<String> = []
        for name in (try? fm.contentsOfDirectory(atPath: shared.path)) ?? [] {
            // iCloud Drive leaves ".name.icloud" until a file is downloaded.
            if name.hasPrefix("."), name.hasSuffix(".icloud") {
                let real = String(name.dropFirst().dropLast(".icloud".count))
                try? fm.startDownloadingUbiquitousItem(at: shared.appendingPathComponent(real))
                theirs.insert(real)
            } else if !name.hasPrefix(".") {
                theirs.insert(name)
            }
        }
        for name in mine.subtracting(theirs) {
            try? fm.copyItem(at: local.appendingPathComponent(name), to: shared.appendingPathComponent(name))
        }
        var arrived = 0
        for name in theirs.subtracting(mine) where fm.fileExists(atPath: shared.appendingPathComponent(name).path) {
            if (try? fm.copyItem(at: shared.appendingPathComponent(name), to: local.appendingPathComponent(name))) != nil { arrived += 1 }
        }
        return arrived
    }
}
