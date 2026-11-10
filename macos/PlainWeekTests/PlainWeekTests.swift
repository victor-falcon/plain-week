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
        XCTAssertEqual(QuickAdd.parse("Pay #red", today: today).color, .red)
        XCTAssertEqual(QuickAdd.parse("Pay #Orange", today: today).color, .orange)
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

final class NoteMarkdownTests: XCTestCase {
    typealias Edit = NoteMarkdown.Edit
    func caret(_ text: String, _ at: Int) -> Edit { Edit(text: text, selection: NSRange(location: at, length: 0)) }
    func select(_ text: String, _ at: Int, _ length: Int) -> Edit { Edit(text: text, selection: NSRange(location: at, length: length)) }

    func testHeadings() {
        let h2 = NoteMarkdown.toggleHeading(caret("Plan\nnext", 2), level: 2)
        XCTAssertEqual(h2, caret("## Plan\nnext", 5))
        // Another level replaces it; the same level removes it.
        XCTAssertEqual(NoteMarkdown.toggleHeading(h2, level: 1).text, "# Plan\nnext")
        XCTAssertEqual(NoteMarkdown.toggleHeading(h2, level: 2).text, "Plan\nnext")
    }

    func testTodoLinesAndBoxes() {
        let todo = NoteMarkdown.toggleTodo(caret("Milk", 4))
        XCTAssertEqual(todo, caret("- [ ] Milk", 10))
        XCTAssertEqual(NoteMarkdown.toggleTodo(todo).text, "Milk")
        // Several lines at once.
        XCTAssertEqual(NoteMarkdown.toggleTodo(select("a\nb", 0, 3)).text, "- [ ] a\n- [ ] b")
        XCTAssertEqual(NoteMarkdown.toggleTodoBox("x\n- [ ] Milk", at: 4), "x\n- [x] Milk")
        XCTAssertEqual(NoteMarkdown.toggleTodoBox("- [x] Milk", at: 2), "- [ ] Milk")
        XCTAssertNil(NoteMarkdown.toggleTodoBox("Milk", at: 1))
    }

    func testWrapAndUnwrap() {
        let bold = NoteMarkdown.toggleWrap(select("a word b", 2, 4), .bold)
        XCTAssertEqual(bold, select("a **word** b", 4, 4))
        XCTAssertEqual(NoteMarkdown.toggleWrap(bold, .bold), select("a word b", 2, 4))
        XCTAssertEqual(NoteMarkdown.toggleWrap(select("**word**", 0, 8), .bold), select("word", 0, 4))
        // No selection: an empty pair with the caret inside.
        XCTAssertEqual(NoteMarkdown.toggleWrap(caret("", 0), .strike), caret("~~~~", 2))
        XCTAssertEqual(NoteMarkdown.toggleWrap(select("hi", 0, 2), .underline).text, "++hi++")
        XCTAssertEqual(NoteMarkdown.toggleWrap(select("hi", 0, 2), .italic).text, "_hi_")
    }

    func testColors() {
        XCTAssertEqual(NoteMarkdown.setTextColor(select("say hi", 4, 2), "red"), select("say {red}hi{/}", 9, 2))
        XCTAssertEqual(NoteMarkdown.setTextColor(select("say {red}hi{/}", 9, 2), nil).text, "say hi")
        XCTAssertEqual(NoteMarkdown.setTextColor(select("say {red}hi{/}", 9, 2), "green").text, "say {green}hi{/}")
        XCTAssertEqual(NoteMarkdown.setHighlight(select("hi", 0, 2), "yellow").text, "==hi==")
        XCTAssertEqual(NoteMarkdown.setHighlight(select("hi", 0, 2), "green").text, "=={green}hi==")
    }

    func testInsert() {
        XCTAssertEqual(NoteMarkdown.insert(select("at X", 3, 1), "09:30"), caret("at 09:30", 8))
    }
}

final class FocusTimerTests: XCTestCase {
    func testCountsPausesAndResumes() {
        var clock = Date(timeIntervalSince1970: 1000)
        let timer = FocusTimer()
        timer.now = { clock }
        timer.start("a", day: "2026-11-09")
        clock += 90
        XCTAssertEqual(timer.elapsed(), 90)
        timer.pause()
        clock += 600
        XCTAssertEqual(timer.elapsed(), 90)
        timer.resume()
        clock += 30
        XCTAssertEqual(timer.elapsed(), 120)
        XCTAssertTrue(timer.isRunning)
        timer.stop()
        XCTAssertFalse(timer.isActive)
        XCTAssertEqual(timer.elapsed(), 0)
    }

    func testSwitchingTaskLogsTimeAndRestartsTheStopwatch() {
        var clock = Date(timeIntervalSince1970: 1000)
        var logs: [(String, TimeInterval)] = []
        let timer = FocusTimer()
        timer.now = { clock }
        timer.onLog = { id, seconds, _, _ in logs.append((id, seconds)) }
        timer.start("a", day: "2026-11-09", mode: .stopwatch)
        clock += 90
        timer.switchTask(to: "b")
        XCTAssertEqual(timer.taskId, "b")
        XCTAssertEqual(timer.elapsed(), 0)
        XCTAssertTrue(timer.isRunning)
        clock += 30
        timer.stop()
        XCTAssertEqual(logs.map(\.0), ["a", "b"])
        XCTAssertEqual(logs.map(\.1), [90, 30])
    }

    func testSwitchingTaskKeepsThePomodoroPhase() {
        var clock = Date(timeIntervalSince1970: 1000)
        let timer = FocusTimer()
        timer.now = { clock }
        timer.settingsOverride = FocusTimer.Settings()
        timer.start("a", day: nil, mode: .pomodoro)
        clock += 600
        timer.pause()
        timer.switchTask(to: "b")
        XCTAssertEqual(timer.taskId, "b")
        XCTAssertEqual(timer.remaining(), 15 * 60)
        XCTAssertFalse(timer.isRunning)
    }

    func testFormat() {
        XCTAssertEqual(FocusTimer.format(5), "00:05")
        XCTAssertEqual(FocusTimer.format(754), "12:34")
        XCTAssertEqual(FocusTimer.format(3723), "1:02:03")
    }

    func testProgressAndNextTask() {
        let store = TaskStore(fileURL: nil)
        let a = store.create(text: "A", date: "2026-11-09")
        let b = store.create(text: "B", date: "2026-11-09", time: "08:00")
        store.create(text: "C", date: "2026-11-09")
        store.toggleDone(b)
        XCTAssertEqual(store.progress(on: "2026-11-09").done, 1)
        XCTAssertEqual(store.progress(on: "2026-11-09").total, 3)
        // Timed tasks come first, done ones are skipped.
        XCTAssertEqual(store.openTasks(on: "2026-11-09").first?.id, a)
        XCTAssertEqual(store.progress(on: "2026-11-10").total, 0)
    }
}

final class NewFeatureTests: XCTestCase {
    func testTimeLogTotals() {
        let log = TimeLog(fileURL: nil)
        let monday = DateKey.localDate("2026-11-09").addingTimeInterval(9 * 3600)
        log.add("a", seconds: 600, start: monday)
        log.add("a", seconds: 300, start: monday.addingTimeInterval(86400))
        log.add("b", seconds: 0.4, start: monday)
        XCTAssertEqual(log.total(for: "a"), 900)
        XCTAssertEqual(log.total(for: "b"), 0)
        XCTAssertEqual(log.total(on: "2026-11-09"), 600)
        XCTAssertEqual(TimeLog.format(4800), "1h 20m")
        XCTAssertEqual(TimeLog.format(2700), "45m")
    }

    func testPomodoroSwitchesPhaseAndLogsOnlyFocus() {
        let clock = TestClock()
        let timer = FocusTimer()
        timer.now = { clock.now }
        timer.settingsOverride = .init()
        var logged: TimeInterval = 0
        var ended: [FocusTimer.Phase] = []
        timer.onLog = { _, seconds, _, _ in logged += seconds }
        timer.onPhaseEnd = { ended.append($0) }
        timer.start("a", day: nil, mode: .pomodoro)
        clock.now += timer.workLength
        timer.tick()
        XCTAssertEqual(ended, [.work])
        XCTAssertEqual(timer.phase, .rest)
        XCTAssertEqual(logged, timer.workLength)
        clock.now += timer.breakLength
        timer.tick()
        XCTAssertEqual(ended, [.work, .rest])
        XCTAssertEqual(logged, timer.workLength, "a break is not focus time")
        clock.now += 60
        XCTAssertEqual(timer.remaining(), timer.workLength - 60)
        timer.stop()
        XCTAssertEqual(logged, timer.workLength + 60)
    }

    @MainActor
    func testRemindersPlanTimedOpenTasks() {
        let store = TaskStore(fileURL: nil)
        store.create(text: "Dentist", date: "2026-11-10", time: "14:00")
        store.create(text: "No time", date: "2026-11-10")
        let done = store.create(text: "Done", date: "2026-11-10", time: "09:00")
        store.toggleDone(done)
        store.create(text: "Too late", date: "2026-11-09", time: "08:00")
        let now = DateKey.localDate("2026-11-09").addingTimeInterval(12 * 3600)
        let plan = Reminders.plan(store: store, now: now, lead: 5)
        XCTAssertEqual(plan.map(\.title), ["Dentist"])
        XCTAssertEqual(plan.first?.fireDate, DateKey.localDate("2026-11-10").addingTimeInterval(14 * 3600 - 300))
        XCTAssertEqual(plan.first?.body, "In 5 min · 14:00")
    }

    func testBackupsWriteOncePerDayAndPrune() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = TaskStore(fileURL: nil)
        XCTAssertNil(Backups.runIfNeeded(store: store, today: "2026-11-09", folder: folder, force: true), "nothing to back up")
        store.create(text: "A", date: "2026-11-09")
        XCTAssertNotNil(Backups.runIfNeeded(store: store, today: "2026-11-09", folder: folder, force: true))
        for day in 1...20 { FileManager.default.createFile(atPath: folder.appendingPathComponent(Backups.fileName(String(format: "2026-10-%02d", day))).path, contents: Data()) }
        Backups.prune(folder)
        let left = try FileManager.default.contentsOfDirectory(atPath: folder.path).sorted()
        XCTAssertEqual(left.count, Backups.keep)
        XCTAssertEqual(left.last, "plain-week-2026-11-09.json")
    }

    func testPaletteFindsCommandsDaysAndTasks() {
        let store = TaskStore(fileURL: nil)
        store.create(text: "Call Joao", date: "2026-11-10", notes: "about the release")
        let today = "2026-11-09"
        XCTAssertTrue(Palette.results("review", store: store, today: today).contains { $0.target == .command(.review) })
        XCTAssertEqual(Palette.results("fri", store: store, today: today).first?.target, .day("2026-11-13"))
        XCTAssertTrue(Palette.results("release", store: store, today: today).contains { $0.title == "Call Joao" })
        XCTAssertEqual(Palette.results("", store: store, today: today).count, Palette.Command.allCases.count)
    }

    @MainActor
    func testVimKeysMoveMarkAndDelete() {
        let store = TaskStore(fileURL: nil)
        let planner = PlannerModel(today: "2026-11-09")
        let timer = FocusTimer()
        let a = store.create(text: "A", date: "2026-11-09")
        let b = store.create(text: "B", date: "2026-11-09")
        store.create(text: "C", date: "2026-11-10")
        let key = { (k: String) in KeyboardNav.handle(k, store: store, planner: planner, timer: timer, undoManager: nil) }
        key("j")
        XCTAssertEqual(planner.cursor, Cursor(day: "2026-11-09", index: 0), "the first key shows the cursor on today")
        key("j")
        XCTAssertEqual(planner.cursor?.index, 1)
        key("x")
        XCTAssertTrue(store.rows[b]!.done)
        key("l")
        XCTAssertEqual(planner.cursor, Cursor(day: "2026-11-10", index: 0))
        key("h"); key("k")
        let now = Date()
        KeyboardNav.handle("d", store: store, planner: planner, timer: timer, undoManager: nil, now: now)
        XCTAssertNotNil(store.item(a), "one d does nothing yet")
        KeyboardNav.handle("d", store: store, planner: planner, timer: timer, undoManager: nil, now: now.addingTimeInterval(0.3))
        XCTAssertNil(store.item(a))
        key("\u{1B}")
        XCTAssertNil(planner.cursor)
    }
}

/// A clock the tests move by hand.
final class TestClock {
    var now = Date(timeIntervalSince1970: 1000)
}

final class PomodoroCycleTests: XCTestCase {
    /// A Pomodoro timer with fixed settings (never the user's) and a hand clock.
    private func makeTimer(autoStart: Bool = true) -> (FocusTimer, TestClock) {
        let clock = TestClock()
        let timer = FocusTimer()
        timer.now = { clock.now }
        timer.settingsOverride = .init(workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, sessionsPerCycle: 4, autoStart: autoStart)
        return (timer, clock)
    }

    private func runPhase(_ timer: FocusTimer, _ clock: TestClock) {
        clock.now += timer.phaseLength
        timer.tick()
    }

    func testLongBreakAfterFourSessionsAndCounting() {
        let (timer, clock) = makeTimer()
        var finished = 0
        timer.onLog = { _, _, _, done in if done { finished += 1 } }
        timer.start("a", day: nil, mode: .pomodoro)
        var phases: [FocusTimer.Phase] = []
        for _ in 0..<8 {
            runPhase(timer, clock)
            phases.append(timer.phase)
        }
        XCTAssertEqual(phases, [.rest, .work, .rest, .work, .rest, .work, .longRest, .work])
        XCTAssertEqual(finished, 4)
        XCTAssertEqual(timer.completedSessions, 4)
        XCTAssertEqual(timer.sessionsInCycle, 0, "a new cycle starts after the long break")
    }

    func testDotsDuringTheCycle() {
        let (timer, clock) = makeTimer()
        timer.start("a", day: nil, mode: .pomodoro)
        runPhase(timer, clock)
        XCTAssertEqual(timer.sessionsInCycle, 1)
        for _ in 0..<5 { runPhase(timer, clock) }
        XCTAssertEqual(timer.phase, .work)
        runPhase(timer, clock)
        XCTAssertEqual(timer.phase, .longRest)
        XCTAssertEqual(timer.sessionsInCycle, 4, "the long break shows the full cycle")
    }

    func testWithoutAutoStartItWaitsForPlay() {
        let (timer, clock) = makeTimer(autoStart: false)
        timer.start("a", day: nil, mode: .pomodoro)
        runPhase(timer, clock)
        XCTAssertEqual(timer.phase, .rest)
        XCTAssertFalse(timer.isRunning)
        clock.now += 600
        XCTAssertEqual(timer.remaining(), timer.breakLength, "nothing counts while waiting")
        timer.resume()
        clock.now += 60
        XCTAssertEqual(timer.remaining(), timer.breakLength - 60)
    }

    func testSkippingFocusDoesNotCountASession() {
        let (timer, clock) = makeTimer()
        var finished = 0
        var seconds: TimeInterval = 0
        timer.onLog = { _, s, _, done in seconds += s; if done { finished += 1 } }
        timer.start("a", day: nil, mode: .pomodoro)
        clock.now += 300
        timer.skipPhase()
        XCTAssertEqual(timer.phase, .rest)
        XCTAssertEqual(finished, 0)
        XCTAssertEqual(seconds, 300, "the focus time still counts")
    }

    func testTimeLogCountsSessionsPerDay() {
        let log = TimeLog(fileURL: nil)
        let monday = DateKey.localDate("2026-11-09").addingTimeInterval(9 * 3600)
        log.add("a", seconds: 1500, start: monday, pomodoro: true)
        log.add("a", seconds: 600, start: monday)
        log.add("a", seconds: 1500, start: monday.addingTimeInterval(86400), pomodoro: true)
        XCTAssertEqual(log.pomodoros(on: "2026-11-09"), 1)
        XCTAssertEqual(log.total(on: "2026-11-09"), 2100)
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

    func testDoneTasksByDayAndAll() throws {
        let store = makeStore()
        let a = store.create(text: "A", date: "2026-11-09")
        let b = store.create(text: "B", date: "2026-11-10")
        let c = store.create(text: "C", date: nil)
        store.create(text: "Open", date: "2026-11-09")
        let gym = store.create(text: "Gym", date: "2026-11-09")
        try store.setRecurrence(gym, .daily(every: 1))
        for id in [a, b, c] { store.toggleDone(id) }
        let gymDone = store.toggleDone("\(gym):2026-11-11")!
        XCTAssertEqual(store.doneTasks(on: "2026-11-09").map(\.id), [a])
        XCTAssertEqual(store.doneTasks(on: "2026-11-11").map(\.id), [gymDone])
        // Newest first; Backlog included; the series row itself never.
        XCTAssertEqual(store.doneTasks().map(\.id), [gymDone, c, b, a])
    }

    func testCalendarRevealsAndSelectsADay() {
        let planner = PlannerModel(today: "2026-11-09")
        planner.reveal("2026-11-26")
        XCTAssertEqual(planner.weekStart, "2026-11-23")
        XCTAssertEqual(planner.selectedDay, "2026-11-26")
        // A day already on screen does not scroll.
        planner.reveal("2026-11-24")
        XCTAssertEqual(planner.weekStart, "2026-11-23")
        // With fewer days fitting, the strip starts at the day.
        planner.visibleCount = 2
        planner.reveal("2026-12-03")
        XCTAssertEqual(planner.weekStart, "2026-12-03")
    }

    func testFocusModeFollowsTheSelectedDay() {
        // Focus mode is a saved setting: leave the user's as it was.
        let saved = UserDefaults.standard.object(forKey: PlannerModel.focusModeKey)
        defer { UserDefaults.standard.set(saved, forKey: PlannerModel.focusModeKey) }
        let planner = PlannerModel(today: "2026-11-09")
        planner.focusMode = false
        planner.toggleFocusMode()
        XCTAssertEqual(planner.focusedDay, "2026-11-09")
        XCTAssertFalse(planner.isBlurred("2026-11-09"))
        XCTAssertTrue(planner.isBlurred("2026-11-11"))
        // Clicking another day focuses it; today blurs.
        planner.focusDay("2026-11-11")
        XCTAssertFalse(planner.isBlurred("2026-11-11"))
        XCTAssertTrue(planner.isBlurred("2026-11-09"))
        XCTAssertFalse(planner.isBlurred(nil))
        // Clicking its header again clears the selection: back to today.
        planner.select("2026-11-11")
        XCTAssertFalse(planner.isBlurred("2026-11-09"))
        // Outside focus mode nothing is blurred and clicks select nothing.
        planner.toggleFocusMode()
        planner.focusDay("2026-11-12")
        XCTAssertNil(planner.selectedDay)
        XCTAssertFalse(planner.isBlurred("2026-11-12"))
    }

    func testSelectingADayTogglesIt() {
        let planner = PlannerModel(today: "2026-11-09")
        planner.select("2026-11-10")
        XCTAssertEqual(planner.selectedDay, "2026-11-10")
        planner.select("2026-11-10")
        XCTAssertNil(planner.selectedDay)
    }

    func testRejectsForeignFiles() {
        XCTAssertThrowsError(try TaskStore.parseImport(Data("{\"format\":\"other\"}".utf8)))
    }
}

@MainActor
final class SyncTests: XCTestCase {
    func testMergeKeepsTheLatestWrite() {
        let a = TaskStore(fileURL: nil), b = TaskStore(fileURL: nil)
        let id = a.create(text: "Call Joao", date: "2026-11-10")
        XCTAssertEqual(b.merge(a.allRows), 1)
        b.update(id, TaskPatch(text: "Call Joao back"))
        XCTAssertEqual(a.merge(b.allRows), 1)
        XCTAssertEqual(a.rows[id]?.text, "Call Joao back")
        // An older copy changes nothing.
        XCTAssertEqual(b.merge(a.allRows), 0)
    }

    func testFolderSyncBetweenTwoMacs() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("pw-sync-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let mac1 = TaskStore(fileURL: nil), mac2 = TaskStore(fileURL: nil)
        let id = mac1.create(text: "Plan the week", date: "2026-11-10")
        FolderSync.sync(store: mac1, folder: folder, device: "one")
        XCTAssertEqual(FolderSync.sync(store: mac2, folder: folder, device: "two"), 1)
        XCTAssertEqual(mac2.rows[id]?.text, "Plan the week")

        mac2.delete(id)
        FolderSync.sync(store: mac2, folder: folder, device: "two")
        FolderSync.sync(store: mac1, folder: folder, device: "one")
        XCTAssertEqual(mac1.rows[id]?.isDeleted, true)
        let files = try FileManager.default.contentsOfDirectory(atPath: folder.path).sorted()
        XCTAssertEqual(files, ["plain-week-sync-one.json", "plain-week-sync-two.json"])
    }

    func testReminderFieldsRoundTrip() {
        let timed = ReminderFields(title: "Gym", notes: "Legs", done: false, date: "2026-11-12", time: "07:30")
        let due = timed.dueComponents
        XCTAssertEqual(due?.hour, 7)
        XCTAssertEqual(ReminderFields.from(due: due, title: "Gym", notes: "Legs", done: false), timed)
        let backlog = ReminderFields(title: "Someday", notes: "", done: false, date: nil, time: "09:00")
        XCTAssertNil(backlog.time)
        XCTAssertNil(backlog.dueComponents)
        XCTAssertEqual(ReminderFields.from(due: nil, title: "Someday", notes: nil, done: false), backlog)
    }

    func testTaskLink() {
        XCTAssertEqual(TaskLink.taskId(TaskLink.url("abc-123")), "abc-123")
        XCTAssertEqual(TaskLink.taskId(TaskLink.url("series:2026-11-10")), "series:2026-11-10")
        XCTAssertNil(TaskLink.taskId(URL(string: "https://example.com/task/1")))
        XCTAssertNil(TaskLink.taskId(nil))
    }

    func testCalendarPlanHasUnfinishedTimedTasksInRange() {
        let store = TaskStore(fileURL: nil)
        let today = "2026-11-10"
        store.create(text: "Standup", date: today, time: "09:30")
        store.create(text: "No time", date: today)
        let done = store.create(text: "Done already", date: today, time: "10:00")
        store.update(done, TaskPatch(done: true))
        store.create(text: "Too far", date: DateKey.addDays(today, 60), time: "08:00")
        let plan = CalendarPublisher.plan(store: store, today: today)
        XCTAssertEqual(plan.map(\.title), ["Standup"])
        XCTAssertEqual(Calendar.current.component(.hour, from: plan[0].start), 9)
        XCTAssertEqual(Calendar.current.component(.minute, from: plan[0].start), 30)
    }
}

@MainActor
final class AppLockTests: XCTestCase {
    func makeLock() -> AppLock {
        let lock = AppLock(fileURL: nil)
        lock.setUp(password: "tulip", question: "First teacher?", answer: "  Mrs   Gonçalves ", rounds: 10)
        return lock
    }

    func testStartsUnlockedWithoutPasswordAndLocksOnlyWhenSetUp() {
        let lock = AppLock(fileURL: nil)
        lock.lock()
        XCTAssertFalse(lock.isLocked)
        let set = makeLock()
        set.lock()
        XCTAssertTrue(set.isLocked)
        XCTAssertEqual(set.unlock(password: "nope"), .wrong)
        XCTAssertEqual(set.unlock(password: "tulip"), .unlocked)
        XCTAssertFalse(set.isLocked)
    }

    func testPersistsOnlyHashes() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("lock-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: url) }
        let lock = AppLock(fileURL: url)
        lock.setUp(password: "tulip", question: "First teacher?", answer: "Smith", rounds: 10)
        let text = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(text.contains("tulip"))
        XCTAssertFalse(text.lowercased().contains("smith"))
        let reopened = AppLock(fileURL: url)
        XCTAssertTrue(reopened.isLocked, "locked at launch")
        XCTAssertEqual(reopened.unlock(password: "tulip"), .unlocked)
    }

    func testLocksAfterIdleMinutes() {
        let lock = makeLock()
        _ = lock.unlock(password: "tulip")
        var clock = Date()
        lock.now = { clock }
        lock.noteActivity()
        clock += 4 * 60
        lock.checkIdle()
        XCTAssertFalse(lock.isLocked)
        clock += 61
        lock.checkIdle()
        XCTAssertTrue(lock.isLocked)
    }

    func testWrongPasswordsMakeYouWait() {
        let lock = makeLock()
        var clock = Date()
        lock.now = { clock }
        lock.lock()
        for _ in 0..<AppLock.freeAttempts { XCTAssertEqual(lock.unlock(password: "x"), .wrong) }
        XCTAssertEqual(lock.unlock(password: "tulip"), .wait(30))
        clock += 31
        XCTAssertEqual(lock.unlock(password: "tulip"), .unlocked)
    }

    func testRecoveryNeedsAnswerThenOwnerCheck() {
        let lock = makeLock()
        lock.lock()
        XCTAssertFalse(lock.resetPassword("rose1"), "no reset without recovery")
        lock.startRecovery()
        XCTAssertEqual(lock.answer("Mrs Smith"), .wrong)
        XCTAssertEqual(lock.answer("mrs goncalves"), .unlocked, "case, accents and spaces aside")
        XCTAssertEqual(lock.recovery, .confirming)
        XCTAssertFalse(lock.resetPassword("rose1"), "Touch ID or the Mac password comes first")
        lock.recoveryConfirmed()
        XCTAssertTrue(lock.resetPassword("rose1"))
        XCTAssertFalse(lock.isLocked)
        XCTAssertTrue(lock.checkPassword("rose1"))
        XCTAssertFalse(lock.checkPassword("tulip"))
    }

    func testSettingsChangesNeedTheCurrentPassword() {
        let lock = makeLock()
        XCTAssertFalse(lock.changePassword(current: "x", new: "rose1"))
        XCTAssertTrue(lock.changePassword(current: "tulip", new: "rose1"))
        XCTAssertFalse(lock.turnOff(password: "tulip"))
        XCTAssertTrue(lock.turnOff(password: "rose1"))
        XCTAssertFalse(lock.isEnabled)
    }
}

@MainActor
final class GapFeatureTests: XCTestCase {
    func testDurationAndRemindRoundTripAndOldFilesStillLoad() throws {
        let task = PlainTask(id: "a", text: "Gym", date: "2026-11-10", someday_column: nil, position: "a0",
                             time: "07:30", duration: 45, remind: 10, created_at: "t", updated_at: "t")
        let back = try JSONDecoder().decode(PlainTask.self, from: JSONEncoder().encode(task))
        XCTAssertEqual(back.duration, 45)
        XCTAssertEqual(back.remind, 10)
        let old = #"{"id":"b","text":"Old","date":null,"position":"a0","created_at":"t","updated_at":"t"}"#
        let decoded = try JSONDecoder().decode(PlainTask.self, from: Data(old.utf8))
        XCTAssertNil(decoded.duration)
        XCTAssertNil(decoded.remind)
    }

    func testQuickAddReadsDurations() {
        XCTAssertEqual(QuickAdd.parse("gym @7 for 45m", today: "2026-11-10").duration, 45)
        XCTAssertEqual(QuickAdd.parse("deep work ~1h30", today: "2026-11-10").duration, 90)
        XCTAssertEqual(QuickAdd.parse("write for 2h", today: "2026-11-10").text, "write")
        let plain = QuickAdd.parse("cook for friends", today: "2026-11-10")
        XCTAssertNil(plain.duration)
        XCTAssertEqual(plain.text, "cook for friends")
        XCTAssertNil(QuickAdd.parseDuration("45"), "a bare number is not a length")
    }

    func testEachTaskCanChooseItsReminder() {
        let store = TaskStore(fileURL: nil)
        let early = store.create(text: "Flight", date: "2026-11-10", time: "14:00")
        store.update(early, TaskPatch(remind: .some(60)))
        let off = store.create(text: "Quiet", date: "2026-11-10", time: "15:00")
        store.update(off, TaskPatch(remind: .some(-1)))
        store.create(text: "Default", date: "2026-11-10", time: "16:00")
        let now = DateKey.localDate("2026-11-10").addingTimeInterval(8 * 3600)
        let plan = Reminders.plan(store: store, now: now, lead: 5)
        XCTAssertEqual(plan.map(\.title), ["Flight", "Default"])
        XCTAssertEqual(plan[0].fireDate, DateKey.localDate("2026-11-10").addingTimeInterval(13 * 3600))
        // Settings off: only tasks with their own reminder.
        XCTAssertEqual(Reminders.plan(store: store, now: now, lead: nil).map(\.title), ["Flight"])
    }

    func testPlannedMinutesAndCalendarLength() {
        let store = TaskStore(fileURL: nil)
        store.create(text: "Write", date: "2026-11-10", time: "09:00", duration: 90)
        store.create(text: "Call", date: "2026-11-10", time: "11:00")
        let done = store.create(text: "Done", date: "2026-11-10", time: "12:00", duration: 60)
        store.toggleDone(done)
        XCTAssertEqual(store.plannedMinutes(on: "2026-11-10"), 90)
        let plan = CalendarPublisher.plan(store: store, today: "2026-11-10")
        XCTAssertEqual(plan.map(\.minutes), [90, 30], "no duration: 30 minutes")
        XCTAssertEqual(TaskTiming.short(90), "1h 30m")
    }

    func testRemindersListHasEachDayOfARepeat() throws {
        let store = TaskStore(fileURL: nil)
        let plain = store.create(text: "Plain", date: "2026-11-10")
        let gone = store.create(text: "Gone", date: "2026-11-10")
        store.delete(gone)
        let series = store.create(text: "Stretch", date: "2026-11-10")
        try store.setRecurrence(series, .daily(every: 1))
        let entries = RemindersMirror.entries(store: store, today: "2026-11-10")
        XCTAssertTrue(entries.contains { $0.key == plain && !$0.repeating })
        XCTAssertTrue(entries.contains { $0.key == gone && $0.deleted })
        let days = entries.filter(\.repeating)
        XCTAssertEqual(days.count, RemindersMirror.repeatDays, "from the series start over two weeks")
        XCTAssertTrue(days.contains { $0.key == "\(series):2026-11-11" })
    }

    func testCleanupKeepsRepeatsAndRecentTasks() throws {
        let store = TaskStore(fileURL: nil)
        let old = store.create(text: "Old", date: "2026-08-01")
        store.toggleDone(old)
        let recent = store.create(text: "Recent", date: "2026-11-01")
        store.toggleDone(recent)
        store.create(text: "Open old", date: "2026-08-02")
        let series = store.create(text: "Daily", date: "2026-08-01")
        try store.setRecurrence(series, .daily(every: 1))
        let day = store.toggleDone("\(series):2026-08-03")
        XCTAssertNotNil(day)
        XCTAssertEqual(Cleanup.run(store: store, today: "2026-11-10", keepDays: 30), 1)
        XCTAssertEqual(store.rows[old]?.isDeleted, true)
        XCTAssertEqual(store.rows[recent]?.isDeleted, false)
        XCTAssertEqual(Cleanup.run(store: store, today: "2026-11-10", keepDays: 0), 0, "forever keeps all")
    }

    func testWelcomeTasksAndWeekPDF() throws {
        let store = TaskStore(fileURL: nil)
        Welcome.add(to: store, today: "2026-11-10")
        XCTAssertEqual(store.days(from: "2026-11-10", to: "2026-11-10")["2026-11-10"]?.count, 4)
        XCTAssertEqual(store.allRows.filter { $0.date == nil }.count, 1)
        let pdf = try XCTUnwrap(WeekPrint.pdf(store: store, monday: "2026-11-09"))
        XCTAssertEqual(String(decoding: pdf.prefix(4), as: UTF8.self), "%PDF")
    }
}
