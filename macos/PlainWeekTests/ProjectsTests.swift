import XCTest
@testable import Plain_Week

@MainActor
final class ProjectsTests: XCTestCase {
    let today = "2026-11-10"

    func testCreateRenameMoveDelete() {
        let projects = ProjectStore(fileURL: nil)
        let a = projects.create(name: "  NORTHWIND ")!
        let b = projects.create(name: "Harbor Studio", color: .green)!
        XCTAssertEqual(projects.create(name: "northwind"), a, "names are unique, ignoring case")
        XCTAssertNil(projects.create(name: "   "))
        XCTAssertEqual(projects.projects.map(\.name), ["NORTHWIND", "Harbor Studio"])

        XCTAssertFalse(projects.rename(b, to: "Northwind"))
        XCTAssertTrue(projects.rename(b, to: "Harbor"))
        projects.move(b, by: -1)
        XCTAssertEqual(projects.projects.map(\.id), [b, a])

        projects.delete(a)
        XCTAssertNil(projects.project(a))
        XCTAssertEqual(projects.allRows.count, 2, "deleted projects stay as tombstones for sync")
    }

    func testMergeKeepsTheNewerRow() {
        let mine = ProjectStore(fileURL: nil)
        let other = ProjectStore(fileURL: nil)
        let id = other.create(name: "Shop")!
        XCTAssertEqual(mine.merge(other.allRows), 1)
        other.rename(id, to: "Boutique")
        XCTAssertEqual(mine.merge(other.allRows), 1)
        XCTAssertEqual(mine.project(id)?.name, "Boutique")
        XCTAssertEqual(mine.merge(other.allRows), 0)
    }

    func testFilterShowsOneProject() {
        let store = TaskStore(fileURL: nil)
        let inside = store.create(text: "In", date: today, project: "p1")
        store.create(text: "Out", date: today)
        var filter = TaskFilter()
        filter.project = "p1"
        XCTAssertFalse(filter.isActive, "the project is not a filter the pill shows")
        XCTAssertEqual(filter.apply(store.days(from: today, to: today)[today] ?? []).map(\.id), [inside])
        XCTAssertEqual(store.openTasks(on: today, filter: filter).count, 1)
        XCTAssertEqual(store.openTasks(on: today).count, 2)
        XCTAssertEqual(store.progress(on: today, filter: filter).total, 1)
    }

    func testPlannerKeepsTheProjectWhenTheFilterIsCleared() {
        let planner = PlannerModel()
        let saved = planner.projectId
        defer { planner.projectId = saved }
        planner.projectId = "p1"
        planner.filter.flaggedOnly = true
        XCTAssertEqual(planner.filter.project, "p1")
        planner.filter = TaskFilter()
        XCTAssertEqual(planner.filter.project, "p1")
        XCTAssertFalse(planner.filter.flaggedOnly)
    }

    func testRepeatingTaskMovesAsASeries() throws {
        let store = TaskStore(fileURL: nil)
        let series = store.create(text: "Standup", date: today)
        _ = try store.setRecurrence(series, .daily(every: 1))
        let occurrence = try XCTUnwrap(store.days(from: "2026-11-12", to: "2026-11-12")["2026-11-12"]?.first)
        store.setProject(occurrence, "p1")
        let later = try XCTUnwrap(store.days(from: "2026-11-14", to: "2026-11-14")["2026-11-14"]?.first)
        XCTAssertEqual(later.task.project_id, "p1")
    }

    func testTaskFileWithoutProjectsStillReads() throws {
        let store = TaskStore(fileURL: nil)
        store.create(text: "x", date: today)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(store.allRows)) as? [[String: Any]])
        json[0].removeValue(forKey: "project_id")
        let rows = try JSONDecoder().decode([PlainTask].self, from: JSONSerialization.data(withJSONObject: json))
        XCTAssertNil(rows[0].project_id)
    }

    func testImportMapsProjects() {
        let store = TaskStore(fileURL: nil)
        store.create(text: "a", date: today, project: "old")
        store.create(text: "b", date: today, project: "gone")
        let file = store.exportFile(appVersion: "1")
        let target = TaskStore(fileURL: nil)
        target.importTasks(file, projects: ["old": "new"])
        XCTAssertEqual(Set(target.allRows.map { $0.project_id ?? "none" }), ["new", "none"])
    }

    func testFolderSyncCarriesProjects() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let macA = ProjectStore(fileURL: nil), macB = ProjectStore(fileURL: nil)
        let id = macA.create(name: "NORTHWIND")!
        FolderSync.syncProjects(macA, folder: folder, device: "a")
        XCTAssertEqual(FolderSync.syncProjects(macB, folder: folder, device: "b"), 1)
        XCTAssertEqual(macB.project(id)?.name, "NORTHWIND")
    }

    func testZistemoTicketsGoToTheirProject() throws {
        let store = TaskStore(fileURL: nil)
        let projects = ProjectStore(fileURL: nil)
        let sync = ZistemoSync(store: store, projects: projects, fileURL: nil)
        let ticket = try XCTUnwrap(ZistemoClient.TimeTicket(["id": 1, "project_id": 7, "task_id": 9, "start_date": today,
                                                              "project_name": "NORTHWIND", "task_name": "Développement"]))
        _ = sync.reconcile([ticket], today: today)
        let task = try XCTUnwrap(store.allRows.first)
        XCTAssertEqual(task.text, "Développement")
        XCTAssertEqual(projects.project(task.project_id)?.name, "NORTHWIND")
        // Moved out by hand: it stays out.
        store.update(task.id, TaskPatch(project: .some(nil)))
        _ = sync.reconcile([ticket], today: today)
        XCTAssertNil(store.item(task.id)?.task.project_id)
    }
}
