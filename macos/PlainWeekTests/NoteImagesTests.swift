import AppKit
import XCTest
@testable import Plain_Week

final class NoteImagesTests: XCTestCase {
    private var dir: URL!

    override func setUpWithError() throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: dir)
    }

    private func png(width: Int, height: Int, alpha: Bool = true) -> Data {
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
                                   samplesPerPixel: alpha ? 4 : 3, hasAlpha: alpha, isPlanar: false,
                                   colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        return rep.representation(using: .png, properties: [:])!
    }

    func testFindsImageLinesOnly() {
        let text = "Intro\n![](attachments/a1.png)\nsee ![](attachments/b.png) inline\n![shot](attachments/c-2.jpg)  "
        let lines = NoteImages.lines(in: text)
        XCTAssertEqual(lines.map(\.name), ["a1.png", "c-2.jpg"])
        XCTAssertEqual((text as NSString).substring(with: lines[0].range), "![](attachments/a1.png)")
        XCTAssertTrue(NoteImages.lines(in: "![](../secret.png)\n![](attachments/x/y.png)").isEmpty)
    }

    func testInsertsOnLinesOfTheirOwn() {
        // Mid-line: a newline before and after.
        let mid = NoteImages.insert(.init(text: "Hello world", selection: NSRange(location: 5, length: 0)), names: ["a.png"])
        XCTAssertEqual(mid.text, "Hello\n![](attachments/a.png)\n world")
        XCTAssertEqual(mid.selection.location, ("Hello\n![](attachments/a.png)\n" as NSString).length)

        // On an empty line before more text: no extra blank line.
        let empty = NoteImages.insert(.init(text: "A\n\nB", selection: NSRange(location: 2, length: 0)), names: ["a.png", "b.png"])
        XCTAssertEqual(empty.text, "A\n![](attachments/a.png)\n![](attachments/b.png)\nB")

        // At the end of the note.
        let end = NoteImages.insert(.init(text: "Note", selection: NSRange(location: 4, length: 0)), names: ["a.png"])
        XCTAssertEqual(end.text, "Note\n![](attachments/a.png)\n")
        XCTAssertEqual(end.selection.location, (end.text as NSString).length)

        // A selection is replaced.
        let replaced = NoteImages.insert(.init(text: "xxSELyy", selection: NSRange(location: 2, length: 3)), names: ["a.png"])
        XCTAssertEqual(replaced.text, "xx\n![](attachments/a.png)\nyy")
    }

    func testKeepsSmallPNGsAndScalesWideImages() throws {
        let small = try XCTUnwrap(NoteImages.save(png(width: 10, height: 5), extension: "png", in: dir))
        XCTAssertTrue(small.hasSuffix(".png"))
        XCTAssertEqual(NSBitmapImageRep(data: try Data(contentsOf: dir.appendingPathComponent(small)))?.pixelsWide, 10)

        let wide = try XCTUnwrap(NoteImages.save(png(width: 3000, height: 1500), extension: "png", in: dir))
        let rep = try XCTUnwrap(NSBitmapImageRep(data: try Data(contentsOf: dir.appendingPathComponent(wide))))
        XCTAssertEqual(rep.pixelsWide, NoteImages.maxPixelWidth)
        XCTAssertEqual(rep.pixelsHigh, 1200)

        // A TIFF without transparency (a photo) is stored as JPEG.
        let tiff = NSBitmapImageRep(data: png(width: 20, height: 20, alpha: false))!.tiffRepresentation!
        XCTAssertTrue(try XCTUnwrap(NoteImages.save(tiff, extension: "tiff", in: dir)).hasSuffix(".jpg"))

        XCTAssertNil(NoteImages.save(Data("not an image".utf8), extension: "png", in: dir))
    }

    func testPastesImageDataButNotText() throws {
        let board = NSPasteboard(name: .init("plainweek-test-\(UUID().uuidString)"))
        defer { board.releaseGlobally() }

        board.clearContents()
        board.setData(png(width: 4, height: 4), forType: .png)
        XCTAssertEqual(NoteImages.saveImages(from: board, in: dir).count, 1)

        // Text with an image (a rich text copy) pastes as text.
        board.clearContents()
        board.setString("Some words", forType: .string)
        board.setData(png(width: 4, height: 4), forType: .png)
        XCTAssertTrue(NoteImages.saveImages(from: board, in: dir).isEmpty)
    }

    func testSyncCopiesMissingFilesBothWays() throws {
        let local = dir.appendingPathComponent("local"), shared = dir.appendingPathComponent("shared")
        try FileManager.default.createDirectory(at: local, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: shared, withIntermediateDirectories: true)
        try Data("a".utf8).write(to: local.appendingPathComponent("a.png"))
        try Data("b".utf8).write(to: shared.appendingPathComponent("b.png"))
        try Data("both".utf8).write(to: local.appendingPathComponent("c.png"))
        try Data("both".utf8).write(to: shared.appendingPathComponent("c.png"))

        XCTAssertEqual(NoteImages.sync(local: local, shared: shared), 1)
        let names = { (url: URL) in Set(try FileManager.default.contentsOfDirectory(atPath: url.path)) }
        XCTAssertEqual(try names(local), ["a.png", "b.png", "c.png"])
        XCTAssertEqual(try names(shared), ["a.png", "b.png", "c.png"])
        XCTAssertEqual(NoteImages.sync(local: local, shared: shared), 0)
    }
}
