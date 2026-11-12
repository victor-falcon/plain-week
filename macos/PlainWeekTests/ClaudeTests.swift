import XCTest
@testable import Plain_Week

/// Answers requests with canned responses and records what was sent.
final class StubProtocol: URLProtocol {
    nonisolated(unsafe) static var responses: [(Int, [String: Any])] = []
    nonisolated(unsafe) static var requests: [(URLRequest, [String: Any])] = []

    static func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: config)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        var body: [String: Any] = [:]
        if let stream = request.httpBodyStream {
            stream.open()
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                data.append(buffer, count: n)
            }
            stream.close()
            body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        }
        Self.requests.append((request, body))
        let (status, json) = Self.responses.isEmpty ? (500, [:]) : Self.responses.removeFirst()
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: json))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

@MainActor
final class ClaudeTests: XCTestCase {
    let today = "2026-11-12"

    override func setUp() {
        StubProtocol.responses = []
        StubProtocol.requests = []
    }

    private func message(_ text: String, stop: String = "end_turn") -> [String: Any] {
        ["content": [["type": "thinking", "thinking": ""], ["type": "text", "text": text]], "stop_reason": stop]
    }

    private func task(_ text: String, notes: String = "", subtasks: [Subtask] = []) throws -> PlainTask {
        let store = TaskStore(fileURL: nil)
        let id = store.create(text: text, date: today, notes: notes, subtasks: subtasks)
        return try XCTUnwrap(store.item(id)?.task)
    }

    func testPlanRequestAsksForJSONWithFallbacks() throws {
        let body = ClaudeClient.planRequest(goal: "Launch the shop", start: "2026-11-16", today: today)
        XCTAssertEqual(body["model"] as? String, "claude-opus-5-5")
        XCTAssertEqual(body["fallbacks"] as? String, "default")
        let config = try XCTUnwrap(body["output_config"] as? [String: Any])
        XCTAssertEqual(config["effort"] as? String, "high")
        let format = try XCTUnwrap(config["format"] as? [String: Any])
        XCTAssertEqual(format["type"] as? String, "json_schema")
        XCTAssertEqual((format["schema"] as? [String: Any])?["additionalProperties"] as? Bool, false)
        let prompt = try XCTUnwrap((body["messages"] as? [[String: Any]])?.first?["content"] as? String)
        XCTAssertTrue(prompt.contains("Thursday 2026-11-12"))
        XCTAssertTrue(prompt.contains("Monday 2026-11-16"))
        XCTAssertTrue(prompt.contains("Launch the shop"))
        XCTAssertNoThrow(try JSONSerialization.data(withJSONObject: body))
    }

    func testDecodesAndCleansThePlan() throws {
        let json = """
        {"project": " Shop launch ", "tasks": [
          {"title": "Write product texts", "notes": "Ten products.", "subtasks": ["Shoes", " "], "date": "2026-11-17"},
          {"title": "Too early", "notes": "", "subtasks": [], "date": "2026-11-01"},
          {"title": "Not a day", "notes": "", "subtasks": [], "date": "2026-02-30"},
          {"title": "  ", "notes": "", "subtasks": [], "date": "2026-11-17"}
        ]}
        """
        let plan = try ClaudeClient.decodePlan(json, start: "2026-11-16")
        XCTAssertEqual(plan.project, "Shop launch")
        XCTAssertEqual(plan.tasks.map(\.title), ["Write product texts", "Too early", "Not a day"])
        XCTAssertEqual(plan.tasks.map(\.date), ["2026-11-17", "2026-11-16", "2026-11-16"])
        XCTAssertEqual(plan.tasks[0].subtasks, ["Shoes"])
        XCTAssertTrue(plan.tasks.allSatisfy(\.include))
        XCTAssertThrowsError(try ClaudeClient.decodePlan(#"{"project": "x", "tasks": []}"#, start: today))
        XCTAssertThrowsError(try ClaudeClient.decodePlan("not json", start: today))
    }

    func testCreatesTheTickedTasksInANewProject() throws {
        let store = TaskStore(fileURL: nil)
        let projects = ProjectStore(fileURL: nil)
        _ = projects.create(name: "Shop launch")
        var plan = ClaudeClient.Plan(project: "Shop launch", tasks: [
            .init(title: "Texts", notes: "Ten products.", subtasks: ["Shoes", "Bags"], date: "2026-11-17"),
            .init(title: "Skip me", notes: "", subtasks: [], date: "2026-11-17"),
        ])
        plan.tasks[1].include = false
        let id = try XCTUnwrap(ClaudeAssistant.create(plan, store: store, projects: projects, undoManager: nil))
        // The name was taken: a number is added.
        XCTAssertEqual(projects.project(id)?.name, "Shop launch 2")
        let rows = store.allRows.filter { !$0.isDeleted }
        XCTAssertEqual(rows.map(\.text), ["Texts"])
        XCTAssertEqual(rows[0].project_id, id)
        XCTAssertEqual(rows[0].date, "2026-11-17")
        XCTAssertEqual(rows[0].notes, "Ten products.")
        XCTAssertEqual(rows[0].subtasks.map(\.text), ["Shoes", "Bags"])
    }

    func testWorkRequestSendsTheTaskWithoutImages() throws {
        let t = try task("Compare payment providers",
                         notes: "Swiss and EU only.\n![](attachments/a.png)\n",
                         subtasks: [Subtask(id: "s1", text: "List fees", done: true)])
        let body = ClaudeClient.workRequest(task: t, project: "Shop launch")
        let prompt = try XCTUnwrap((body["messages"] as? [[String: Any]])?.first?["content"] as? String)
        XCTAssertTrue(prompt.contains("Task: Compare payment providers"))
        XCTAssertTrue(prompt.contains("Project: Shop launch"))
        XCTAssertTrue(prompt.contains("Swiss and EU only."))
        XCTAssertTrue(prompt.contains("- [x] List fees"))
        XCTAssertFalse(prompt.contains("attachments"))
        let tools = try XCTUnwrap(body["tools"] as? [[String: Any]])
        XCTAssertEqual(tools.first?["type"] as? String, "web_search_20260209")
    }

    func testParsesTextAndStopReasons() throws {
        XCTAssertEqual(try ClaudeClient.parse(message("Hello")).text, "Hello")
        XCTAssertThrowsError(try ClaudeClient.parse(message("", stop: "refusal"))) { XCTAssertEqual($0 as? ClaudeClient.Failure, .refused) }
        XCTAssertThrowsError(try ClaudeClient.parse(message("Half", stop: "max_tokens"))) { XCTAssertEqual($0 as? ClaudeClient.Failure, .cutOff) }
        XCTAssertThrowsError(try ClaudeClient.parse(["type": "error"]))
    }

    func testAppendsTheAnswerUnderAHeading() {
        XCTAssertEqual(ClaudeClient.appended("Done.", to: "", on: today).hasPrefix("## Claude · "), true)
        let notes = ClaudeClient.appended("Done.", to: "My notes\n\n", on: today)
        XCTAssertTrue(notes.hasPrefix("My notes\n\n## Claude · "))
        XCTAssertTrue(notes.hasSuffix("\n\nDone."))
    }

    func testSendsHeadersAndResumesAPausedTurn() async throws {
        StubProtocol.responses = [
            (200, ["content": [["type": "text", "text": "Part one. "], ["type": "server_tool_use", "id": "s1", "name": "web_search", "input": [:]]],
                   "stop_reason": "pause_turn"]),
            (200, message("Part two.")),
        ]
        let client = ClaudeClient(apiKey: "sk-ant-test", session: StubProtocol.session())
        let answer = try await client.work(on: try task("Research"), project: nil)
        XCTAssertEqual(answer, "Part one. Part two.")
        XCTAssertEqual(StubProtocol.requests.count, 2)
        let (request, _) = StubProtocol.requests[0]
        XCTAssertEqual(request.value(forHTTPHeaderField: "x-api-key"), "sk-ant-test")
        XCTAssertEqual(request.value(forHTTPHeaderField: "anthropic-version"), ClaudeClient.apiVersion)
        XCTAssertEqual(request.value(forHTTPHeaderField: "anthropic-beta"), ClaudeClient.fallbackBeta)
        // The resumed request carries the paused assistant turn, and no extra user message.
        let messages = try XCTUnwrap(StubProtocol.requests[1].1["messages"] as? [[String: Any]])
        XCTAssertEqual(messages.map { $0["role"] as? String }, ["user", "assistant"])
    }

    func testReportsABadKey() async throws {
        StubProtocol.responses = [(401, ["type": "error", "error": ["type": "authentication_error", "message": "invalid x-api-key"]])]
        let client = ClaudeClient(apiKey: "wrong", session: StubProtocol.session())
        do {
            _ = try await client.plan(goal: "x", start: today, today: today)
            XCTFail("Expected a failure")
        } catch {
            XCTAssertEqual(error as? ClaudeClient.Failure, .http(401, "invalid x-api-key"))
            XCTAssertTrue(error.localizedDescription.contains("did not accept the API key"))
        }
    }

    func testValidDays() {
        XCTAssertTrue(DateKey.isValid("2028-02-29"))
        XCTAssertFalse(DateKey.isValid("2026-02-29"))
        XCTAssertFalse(DateKey.isValid("2026-13-01"))
        XCTAssertFalse(DateKey.isValid("next week"))
    }
}
