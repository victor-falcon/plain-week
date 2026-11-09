import XCTest
@testable import Plain_Week

final class FractionalIndexTests: XCTestCase {
    func testMatchesNpmPackage() throws {
        XCTAssertEqual(try FractionalIndex.keyBetween(nil, nil), "a0")
        XCTAssertEqual(try FractionalIndex.keyBetween("a0", nil), "a1")
        XCTAssertEqual(try FractionalIndex.keyBetween(nil, "a0"), "Zz")
        XCTAssertEqual(try FractionalIndex.keyBetween("a0", "a1"), "a0V")
        XCTAssertEqual(try FractionalIndex.keyBetween("a0", "a0V"), "a0G")
        XCTAssertEqual(try FractionalIndex.keyBetween("Zz", "a0"), "ZzV")
        XCTAssertEqual(try FractionalIndex.keyBetween("az", nil), "b00")
        XCTAssertEqual(try FractionalIndex.keyBetween("a0V", "a1"), "a0l")
    }

    func testManyInsertsStayOrdered() throws {
        var keys = ["a0"]
        for _ in 0..<200 { keys.insert(try FractionalIndex.keyBetween(keys[0], keys[1 < keys.count ? 1 : 0] == keys[0] ? nil : keys[1]), at: 1) }
        XCTAssertEqual(keys.dropFirst().sorted(), Array(keys.dropFirst()).sorted())
        XCTAssertEqual(Set(keys).count, keys.count)
    }

    func testPositionBetweenFallsBackWhenOutOfOrder() {
        XCTAssertEqual(FractionalIndex.positionBetween("a1", "a0"), "a2")
    }
}

final class SmartInputTests: XCTestCase {
    let today = "2026-11-09"

    func testTime() {
        XCTAssertEqual(SmartInput.parse("17:30 Gym", today: today), ParsedNewTask(text: "Gym", date: nil, time: "17:30"))
        XCTAssertEqual(SmartInput.parse("9:05 Call", today: today).time, "09:05")
        XCTAssertEqual(SmartInput.parse("25:00 Gym", today: today).time, nil)
        XCTAssertEqual(SmartInput.parse("17:30", today: today).text, "17:30")
    }

    func testDate() {
        XCTAssertEqual(SmartInput.parse("31 Dec Gym", today: today), ParsedNewTask(text: "Gym", date: "2026-12-31", time: nil))
        XCTAssertEqual(SmartInput.parse("5 ene. Dentist", today: today).date, "2027-01-05")
        XCTAssertEqual(SmartInput.parse("9 Nov Today", today: today).date, "2026-11-09")
        XCTAssertEqual(SmartInput.parse("29 Feb Leap", today: today).date, "2028-02-29")
        XCTAssertEqual(SmartInput.parse("31 Feb Gym", today: today).date, nil)
        XCTAssertEqual(SmartInput.parse("1 September Trip", today: today).date, "2027-09-01")
    }

    func testBothOrders() {
        let expected = ParsedNewTask(text: "Gym", date: "2026-12-31", time: "17:30")
        XCTAssertEqual(SmartInput.parse("31 Dec 17:30 Gym", today: today), expected)
        XCTAssertEqual(SmartInput.parse("17:30 31 Dec Gym", today: today), expected)
    }
}

final class QuickAddTests: XCTestCase {
    // Monday 9 November 2026.
    let today = "2026-11-09"

    func testUsersExample() {
        let quick = QuickAdd.parse("tomorrow call joao @11:30 #yellow daily", today: today)
        XCTAssertEqual(quick.text, "call joao")
        XCTAssertEqual(quick.date, .day("2026-11-10"))
        XCTAssertEqual(quick.time, "11:30")
        XCTAssertEqual(quick.color, .yellow)
        XCTAssertEqual(quick.repeatSpec, .daily(1))
        XCTAssertEqual(quick.repeatSpec?.rule(anchor: "2026-11-10"), .daily(every: 1))
    }

    func testDates() {
        XCTAssertEqual(QuickAdd.parse("Gym today", today: today).date, .day(today))
        XCTAssertEqual(QuickAdd.parse("Gym fri", today: today).date, .day("2026-11-13"))
        XCTAssertEqual(QuickAdd.parse("Gym monday", today: today).date, .day(today))
        XCTAssertEqual(QuickAdd.parse("Plan next week", today: today).date, .day("2026-11-16"))
        XCTAssertEqual(QuickAdd.parse("Read someday", today: today).date, .someday)
        // The last date wins.
        XCTAssertEqual(QuickAdd.parse("today tomorrow Call", today: today).date, .day("2026-11-10"))
        // The web app's leading date still works, with the rest.
        let quick = QuickAdd.parse("31 Dec Party #pink", today: today)
        XCTAssertEqual(quick.date, .day("2026-12-31"))
        XCTAssertEqual(quick.text, "Party")
        XCTAssertEqual(quick.color, .pink)
    }

    func testTimes() {
        XCTAssertEqual(QuickAdd.parse("Call @9", today: today).time, "09:00")
        XCTAssertEqual(QuickAdd.parse("Call @9am", today: today).time, "09:00")
        XCTAssertEqual(QuickAdd.parse("Call @5:15pm", today: today).time, "17:15")
        XCTAssertEqual(QuickAdd.parse("Call @12am", today: today).time, "00:00")
        XCTAssertNil(QuickAdd.parse("Call @25", today: today).time)
        XCTAssertEqual(QuickAdd.parse("Email @joao", today: today).text, "Email @joao")
    }

    func testColors() {
        XCTAssertEqual(QuickAdd.parse("Pay #red", today: today).color, .pink)
        XCTAssertEqual(QuickAdd.parse("Pay #Blue", today: today).color, .cornflower)
        XCTAssertNil(QuickAdd.parse("Fix #123", today: today).color)
        XCTAssertEqual(QuickAdd.parse("Fix #123", today: today).text, "Fix #123")
    }

    func testRepeats() {
        XCTAssertEqual(QuickAdd.parse("Gym weekly", today: today).repeatSpec, .weekly([]))
        XCTAssertEqual(QuickAdd.parse("Rent monthly", today: today).repeatSpec, .monthly)
        XCTAssertEqual(QuickAdd.parse("Standup weekdays", today: today).repeatSpec, .weekly([1, 2, 3, 4, 5]))
        XCTAssertEqual(QuickAdd.parse("Water every 3 days", today: today).repeatSpec, .daily(3))
        XCTAssertEqual(QuickAdd.parse("Gym every mon, wed and fri", today: today).repeatSpec, .weekly([1, 3, 5]))
        let quick = QuickAdd.parse("Gym every tue and coffee", today: today)
        XCTAssertEqual(quick.repeatSpec, .weekly([2]))
        XCTAssertEqual(quick.text, "Gym and coffee")
        XCTAssertEqual(QuickAdd.parse("Gym every week", today: today).repeatSpec?.rule(anchor: "2026-11-12"), .weekly([4]))
    }

    func testOnlyKeywordsKeepsText() {
        XCTAssertEqual(QuickAdd.parse("daily", today: today), QuickTask(text: "daily"))
    }

    func testTargetDate() {
        let plain = QuickAdd.parse("Gym", today: today)
        XCTAssertEqual(plain.targetDate(listDate: "2026-11-11", today: today), "2026-11-11")
        XCTAssertNil(plain.targetDate(listDate: nil, today: today))
        // Someday cannot repeat: a repeating task typed there starts today.
        XCTAssertEqual(QuickAdd.parse("Gym daily", today: today).targetDate(listDate: nil, today: today), today)
    }
}

final class DateKeyTests: XCTestCase {
    func testWeekMath() {
        XCTAssertEqual(DateKey.startOfWeek("2026-11-09"), "2026-11-09")
        XCTAssertEqual(DateKey.startOfWeek("2026-11-15"), "2026-11-09")
        XCTAssertEqual(DateKey.isoWeekday("2026-11-15"), 7)
        XCTAssertEqual(DateKey.isoWeekNumber("2026-11-09"), 46)
        XCTAssertEqual(DateKey.isoWeekNumber("2027-01-01"), 53)
        XCTAssertEqual(DateKey.addDays("2026-12-31", 1), "2027-01-01")
    }

    func testUuidV7() {
        let id = Clock.uuidV7()
        XCTAssertEqual(id.count, 36)
        XCTAssertEqual(Array(id)[14], "7")
    }
}

final class VisibleDaysTests: XCTestCase {
    func testCardsAreAtLeast400Wide() {
        let gap: CGFloat = 12
        XCTAssertEqual(PlannerModel.visibleCount(for: 300, spacing: gap), 1)
        XCTAssertEqual(PlannerModel.visibleCount(for: 811, spacing: gap), 1)
        XCTAssertEqual(PlannerModel.visibleCount(for: 812, spacing: gap), 2)
        XCTAssertEqual(PlannerModel.visibleCount(for: 1664, spacing: gap), 4)
        XCTAssertEqual(PlannerModel.visibleCount(for: 2872, spacing: gap), 7)
        XCTAssertEqual(PlannerModel.visibleCount(for: 5000, spacing: gap), 7)
    }

    func testTodayStaysVisibleWhenFewerDaysFit() {
        let planner = PlannerModel(today: "2026-11-12")
        planner.visibleCount = 3
        planner.goToToday()
        XCTAssertTrue(planner.showsToday)
        XCTAssertEqual(planner.weekStart, "2026-11-12")
        planner.visibleCount = 7
        planner.goToToday()
        XCTAssertEqual(planner.weekStart, "2026-11-09")
    }
}

final class RecurrenceTests: XCTestCase {
    func series(_ rule: Recurrence, date: String = "2026-11-09") -> PlainTask {
        PlainTask(id: "s", text: "Gym", date: date, someday_column: nil, position: "a0", recurrence: rule,
                  created_at: "2026-11-01T00:00:00.000Z", updated_at: "2026-11-01T00:00:00.000Z")
    }

    func testWeekly() {
        let items = RecurrenceEngine.expand(series: series(.weekly([1, 3])), exceptions: [], from: "2026-11-09", to: "2026-11-22")
        XCTAssertEqual(items.compactMap(\.task.date).sorted(), ["2026-11-09", "2026-11-11", "2026-11-16", "2026-11-18"])
        XCTAssertEqual(items.first?.id.hasPrefix("s:"), true)
    }

    func testDailyAndUntil() {
        let items = RecurrenceEngine.expand(series: series(.daily(every: 3, until: "2026-11-15")), exceptions: [], from: "2026-11-01", to: "2026-11-30")
        XCTAssertEqual(items.compactMap(\.task.date).sorted(), ["2026-11-09", "2026-11-12", "2026-11-15"])
    }

    func testMonthlyLastDay() {
        let items = RecurrenceEngine.expand(series: series(.monthly(day: 31), date: "2027-01-31"), exceptions: [], from: "2027-02-01", to: "2027-04-30")
        XCTAssertEqual(items.compactMap(\.task.date).sorted(), ["2027-02-28", "2027-03-31", "2027-04-30"])
    }

    func testExceptionReplacesOccurrence() {
        var moved = series(.weekly([1]))
        moved.id = "e"
        moved.recurrence = nil
        moved.series_id = "s"
        moved.occurrence_date = "2026-11-09"
        moved.date = "2026-11-10"
        let items = RecurrenceEngine.expand(series: series(.weekly([1])), exceptions: [moved], from: "2026-11-09", to: "2026-11-15")
        XCTAssertEqual(items.map(\.task.date), ["2026-11-10"])
        XCTAssertEqual(items.first?.kind, .exception)
    }

    func testSummary() {
        XCTAssertEqual(RecurrenceEngine.summary(.weekly([1, 3])), "Every Mon, Wed")
        XCTAssertEqual(RecurrenceEngine.summary(.daily(every: 1)), "Every day")
        XCTAssertEqual(RecurrenceEngine.summary(.monthly(day: 31)), "Monthly on day 31")
    }
}

final class TaskStoreTests: XCTestCase {
    func makeStore() -> TaskStore { TaskStore(fileURL: nil) }

    func testCreateOrdersWithinDay() {
        let store = makeStore()
        let a = store.create(text: "A", date: "2026-11-09")
        let b = store.create(text: "B", date: "2026-11-09")
        let c = store.create(text: "C", date: "2026-11-09", afterId: a)
        let day = store.week("2026-11-09")["2026-11-09"]!.map(\.id)
        XCTAssertEqual(day, [a, c, b])
    }

    func testTimedTasksFirst() {
        let store = makeStore()
        let a = store.create(text: "A", date: "2026-11-09")
        let b = store.create(text: "B", date: "2026-11-09", time: "18:00")
        let c = store.create(text: "C", date: "2026-11-09", time: "08:00")
        XCTAssertEqual(store.week("2026-11-09")["2026-11-09"]!.map(\.id), [c, b, a])
    }

    func testMoveToSomedayAndBack() {
        let store = makeStore()
        let a = store.create(text: "A", date: "2026-11-09")
        store.move(a, to: nil)
        XCTAssertEqual(store.someday(weekStart: "2026-11-09", today: "2026-11-09").map(\.id), [a])
        XCTAssertEqual(store.rows[a]?.someday_column, 0)
        store.move(a, to: "2026-11-10")
        XCTAssertEqual(store.week("2026-11-09")["2026-11-10"]!.map(\.id), [a])
        XCTAssertNil(store.rows[a]?.someday_column)
    }

    func testEditingAnOccurrenceWritesAnException() throws {
        let store = makeStore()
        let id = store.create(text: "Gym", date: "2026-11-09")
        try store.setRecurrence(id, .weekly([1]))
        let occurrence = store.week("2026-11-16")["2026-11-16"]!.first!
        XCTAssertEqual(occurrence.kind, .occurrence)
        let newId = store.update(occurrence.id, TaskPatch(text: "Swim"))!
        XCTAssertNotEqual(newId, occurrence.id)
        XCTAssertEqual(store.item(occurrence.id)?.task.text, "Swim")
        XCTAssertEqual(store.week("2026-11-23")["2026-11-23"]!.first?.task.text, "Gym")
    }

    func testFutureEditSplitsTheSeries() throws {
        let store = makeStore()
        let id = store.create(text: "Gym", date: "2026-11-09")
        try store.setRecurrence(id, .weekly([1]))
        store.update("\(id):2026-11-23", TaskPatch(text: "Swim"), scope: .future)
        XCTAssertEqual(store.week("2026-11-16")["2026-11-16"]!.first?.task.text, "Gym")
        XCTAssertEqual(store.week("2026-11-23")["2026-11-23"]!.map(\.task.text), ["Swim"])
        XCTAssertEqual(store.week("2026-11-30")["2026-11-30"]!.map(\.task.text), ["Swim"])
        XCTAssertEqual(store.rows[id]?.recurrence?.until, "2026-11-22")
    }

    func testDeleteThisAndFuture() throws {
        let store = makeStore()
        let id = store.create(text: "Gym", date: "2026-11-09")
        try store.setRecurrence(id, .daily(every: 1))
        store.delete("\(id):2026-11-10")
        XCTAssertTrue(store.week("2026-11-09")["2026-11-10"]!.isEmpty)
        XCTAssertEqual(store.week("2026-11-09")["2026-11-11"]!.count, 1)
        store.delete("\(id):2026-11-12", scope: .future)
        XCTAssertTrue(store.week("2026-11-09")["2026-11-12"]!.isEmpty)
        XCTAssertEqual(store.week("2026-11-09")["2026-11-11"]!.count, 1)
    }

    func testStopRepeating() throws {
        let store = makeStore()
        let id = store.create(text: "Gym", date: "2026-11-09")
        try store.setRecurrence(id, .daily(every: 1))
        let plain = try store.setRecurrence("\(id):2026-11-11", nil, scope: .future)!
        XCTAssertEqual(store.item(plain)?.kind, .task)
        XCTAssertEqual(store.week("2026-11-09")["2026-11-12"]!.count, 0)
        XCTAssertEqual(store.week("2026-11-09")["2026-11-10"]!.count, 1)
    }

    func testCarryOverMovesOnlyPlainUnfinished() throws {
        let store = makeStore()
        let late = store.create(text: "Late", date: "2026-11-05")
        let done = store.create(text: "Done", date: "2026-11-06")
        store.toggleDone(done)
        let series = store.create(text: "Gym", date: "2026-11-02")
        try store.setRecurrence(series, .daily(every: 1))
        XCTAssertEqual(store.carryOver(today: "2026-11-09"), 1)
        XCTAssertEqual(store.rows[late]?.date, "2026-11-09")
        XCTAssertEqual(store.rows[done]?.date, "2026-11-06")
        XCTAssertEqual(store.rows[series]?.date, "2026-11-02")
    }

    func testUndoPutsRowsBack() {
        let store = makeStore()
        let undo = UndoManager()
        undo.groupsByEvent = false
        let id = store.create(text: "A", date: "2026-11-09")
        undo.beginUndoGrouping()
        store.perform("Delete", undoManager: undo) { store.delete(id) }
        undo.endUndoGrouping()
        XCTAssertNil(store.item(id))
        undo.undo()
        XCTAssertEqual(store.item(id)?.task.text, "A")
    }

    func testExportImportRoundTrip() throws {
        let store = makeStore()
        let id = store.create(text: "Gym", date: "2026-11-09", color: .pink)
        try store.setRecurrence(id, .weekly([1]))
        store.delete("\(id):2026-11-16")
        store.create(text: "Read", date: nil)
        let file = store.exportFile(appVersion: "test")
        let data = try JSONEncoder().encode(file)
        let json = String(data: data, encoding: .utf8)!
        XCTAssertTrue(json.contains("\"time\":null"))

        let other = makeStore()
        XCTAssertEqual(other.importTasks(try TaskStore.parseImport(data)), 2)
        XCTAssertTrue(other.week("2026-11-16")["2026-11-16"]!.isEmpty)
        XCTAssertEqual(other.week("2026-11-23")["2026-11-23"]!.first?.task.color, .pink)
        XCTAssertEqual(other.someday(weekStart: "2026-11-09", today: "2026-11-09").map(\.task.text), ["Read"])
    }

    func testRejectsForeignFiles() {
        XCTAssertThrowsError(try TaskStore.parseImport(Data("{\"format\":\"other\"}".utf8)))
    }
}
