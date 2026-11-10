import XCTest
@testable import Plain_Week

@MainActor
final class ZistemoTests: XCTestCase {
    let today = "2026-11-10"

    private func ticket(_ id: Int, start: String? = "2026-11-12", completed: Bool = false) -> ZistemoClient.TimeTicket {
        var json: [String: Any] = ["id": "\(id)", "project_id": 7, "task_id": "9", "group_id": 0, "hours": "4.0",
                                   "notes": "Homepage", "completed": completed ? 1 : 0,
                                   "project_name": "Create website", "task_name": "Web development", "group_name": "Sprint 1"]
        if let start { json["start_date"] = start }
        return ZistemoClient.TimeTicket(json)!
    }

    private func makeSync() -> (TaskStore, ZistemoSync) {
        let store = TaskStore(fileURL: nil)
        return (store, ZistemoSync(store: store, fileURL: nil))
    }

    func testParsesTicketsLeniently() {
        let t = ticket(12)
        XCTAssertEqual(t.id, 12)
        XCTAssertEqual(t.taskId, 9)
        XCTAssertEqual(t.hours, 4)
        XCTAssertEqual(t.title, "Web development · Create website")
        XCTAssertEqual(Json.day("2021-05-01 00:00:00"), "2021-05-01")
        XCTAssertEqual(Json.list(["data": [["id": 1]]]).count, 1)
        XCTAssertNil(ZistemoClient.TimeTicket(["name": "no id"]))
    }

    func testFindsTokenAndMessage() {
        XCTAssertEqual(Json.find(["access_token", "token"], in: ["success": true, "data": ["access_token": "abc"]]), "abc")
        XCTAssertEqual(Json.find(["message"], in: ["success": false, "data": ["message": "Wrong api development key", "status": 401]]), "Wrong api development key")
    }

    func testCleansAccount() {
        XCTAssertEqual(ZistemoSync.cleanAccount(" https://Acme.zistemo.com/dashboard "), "acme")
        XCTAssertEqual(ZistemoSync.cleanAccount("acme"), "acme")
    }

    func testImportsOpenTicketsOnce() {
        let (store, sync) = makeSync()
        XCTAssertEqual(sync.reconcile([ticket(1), ticket(2, completed: true), ticket(3, start: "2026-11-01")], today: today), [])
        XCTAssertEqual(sync.linkedCount, 2)
        let tasks = store.allRows
        XCTAssertEqual(tasks.count, 2)
        XCTAssertTrue(tasks.allSatisfy { $0.tags == ["zistemo"] })
        // A ticket that started earlier lands on today.
        XCTAssertEqual(Set(tasks.compactMap(\.date)), ["2026-11-12", today])
        _ = sync.reconcile([ticket(1), ticket(3, start: "2026-11-01")], today: today)
        XCTAssertEqual(store.allRows.count, 2)
    }

    func testDoneFlowsBothWays() throws {
        let (store, sync) = makeSync()
        _ = sync.reconcile([ticket(1)], today: today)
        let id = try XCTUnwrap(store.allRows.first?.id)

        // Ticked here: pushed to zistemo.
        store.toggleDone(id)
        XCTAssertEqual(sync.reconcile([ticket(1)], today: today), [.init(taskId: id, ticketId: 1, done: true)])

        // Completed in zistemo: ticked here, nothing to push.
        let (store2, sync2) = makeSync()
        _ = sync2.reconcile([ticket(5)], today: today)
        let id2 = try XCTUnwrap(store2.allRows.first?.id)
        XCTAssertEqual(sync2.reconcile([ticket(5, completed: true)], today: today), [])
        XCTAssertEqual(store2.item(id2)?.task.done, true)
    }

    func testRemovedTaskDoesNotComeBack() throws {
        let (store, sync) = makeSync()
        _ = sync.reconcile([ticket(1)], today: today)
        store.delete(try XCTUnwrap(store.allRows.first?.id))
        _ = sync.reconcile([ticket(1)], today: today)
        XCTAssertEqual(store.allRows.filter { !$0.isDeleted }.count, 0)
    }

    func testReadsStateFromBeforeTheLiveTimer() throws {
        let old = #"{"links":{"t1":{"ticketId":1,"projectId":2,"taskId":3,"groupId":0,"remoteCompleted":false,"localDone":false}},"pending":[],"userId":9}"#
        let state = try JSONDecoder().decode(ZistemoSync.State.self, from: Data(old.utf8))
        XCTAssertEqual(state.links["t1"]?.ticketId, 1)
        XCTAssertNil(state.live)
        XCTAssertFalse(state.cancelRemote)
    }

    func testReadsTimerStatus() {
        let running = ZistemoClient.RemoteTimer(["status": "active", "is_stopped": false, "project_id": 7, "task_id": "9",
                                                 "project_schedule_id": 1, "start_timestamp": 1_700_000_000])
        XCTAssertEqual(running?.paused, false)
        XCTAssertEqual(running?.start, Date(timeIntervalSince1970: 1_700_000_000))
        XCTAssertEqual(ZistemoClient.RemoteTimer(["status": "paused", "project_id": 7])?.paused, true)
        XCTAssertNil(ZistemoClient.RemoteTimer(["is_stopped": true, "project_id": 7]))
        XCTAssertNil(ZistemoClient.RemoteTimer(["status": "active"]))
    }

    func testFollowsATimerStartedInZistemo() throws {
        let (store, sync) = makeSync()
        let timer = FocusTimer()
        timer.settingsOverride = .init()
        sync.timer = timer
        _ = sync.reconcile([ticket(1)], today: today)
        let id = try XCTUnwrap(store.allRows.first?.id)
        let start = Date().addingTimeInterval(-600)
        var remote = try XCTUnwrap(ZistemoClient.RemoteTimer(["status": "active", "project_id": 7, "task_id": 9, "project_schedule_id": 1,
                                                              "start_timestamp": start.timeIntervalSince1970]))
        sync.follow(remote)
        XCTAssertEqual(timer.taskId, id)
        XCTAssertTrue(timer.isRunning)
        XCTAssertGreaterThan(timer.elapsed(), 590)

        remote.paused = true
        sync.follow(remote)
        XCTAssertFalse(timer.isRunning)

        sync.follow(nil)
        XCTAssertNil(timer.taskId)
        // zistemo logged that time itself: nothing queued here.
        XCTAssertEqual(sync.unsentSeconds, 0)
        timer.stop()
    }

    func testSendsTaskNotesNotAppName() {
        XCTAssertNil(ZistemoClient.noteText("  \n "))
        XCTAssertNil(ZistemoClient.noteText(nil))
        XCTAssertEqual(ZistemoClient.noteText(" Fixed the audit export \n"), "Fixed the audit export")
    }

    func testEncodesForm() {
        XCTAssertEqual(ZistemoClient.encode(["ts[hours]": "1.50", "ts[notes]": "a b"]), "ts%5Bhours%5D=1.50&ts%5Bnotes%5D=a%20b")
    }
}
