import XCTest
@testable import Plain_Week

@MainActor
final class BulkCheckTests: XCTestCase {
    let day = "2026-11-10"

    func testRangeRunsEitherWay() {
        let anchor = CheckAnchor(listKey: "d", id: "b", order: ["a", "b", "c", "d", "e"])
        XCTAssertEqual(anchor.range(to: "d"), ["b", "c", "d"])
        XCTAssertEqual(anchor.range(to: "a"), ["a", "b"])
        XCTAssertNil(anchor.range(to: "z"))
    }

    func testShiftClickChecksEveryTaskBetween() {
        let store = TaskStore(fileURL: nil)
        let ids = (1...5).map { store.create(text: "t\($0)", date: day) }
        let order = store.days(from: day, to: day)[day]!.map(\.id)
        XCTAssertEqual(order, ids)
        // First click ticks t2; Shift-click on t4 ticks t2…t4 (t2 already done).
        store.toggleDone(ids[1])
        let anchor = CheckAnchor(listKey: day, id: ids[1], order: order)
        XCTAssertEqual(store.setDone(anchor.range(to: ids[3])!, true), 2)
        XCTAssertEqual(store.allRows.filter(\.done).map(\.text).sorted(), ["t2", "t3", "t4"])
    }

    func testRepeatingDaysInTheRangeAreTicked() throws {
        let store = TaskStore(fileURL: nil)
        let series = store.create(text: "Standup", date: day)
        _ = try store.setRecurrence(series, .daily(every: 1))
        let plain = store.create(text: "Plain", date: day)
        let order = store.days(from: day, to: day)[day]!.map(\.id)
        XCTAssertEqual(store.setDone(order, true), 2)
        XCTAssertTrue(store.days(from: day, to: day)[day]!.allSatisfy(\.task.done))
        XCTAssertTrue(store.item(plain)!.task.done)
    }
}
