import Foundation
import Observation

/// The calls Plain Week makes to Anthropic's Messages API
/// (`POST https://api.anthropic.com/v1/messages`) with your own API key:
/// planning a project from a goal, and doing one task in writing.
///
/// Swift has no official Anthropic SDK, so these are plain HTTPS requests.
/// The key lives in the keychain. Nothing is sent unless you ask for it.
struct ClaudeClient {
    static let endpoint = URL(string: "https://api.anthropic.com/v1/messages")!
    static let modelsEndpoint = URL(string: "https://api.anthropic.com/v1/models/claude-opus-5-5")!
    static let model = "claude-opus-5-5"
    static let apiVersion = "2026-10-21"
    /// When a safety check declines a request, the API retries it on another
    /// model inside the same call.
    static let fallbackBeta = "server-side-fallback-2026-07-01"

    var apiKey: String
    var session: URLSession = .shared

    enum Failure: LocalizedError, Equatable {
        case noKey
        case http(Int, String)
        case refused
        case cutOff
        case unexpected(String)

        var errorDescription: String? {
            switch self {
            case .noKey: "Add your Anthropic API key in Settings › Claude."
            case .http(401, _): "Anthropic did not accept the API key. Check it in Settings › Claude."
            case .http(429, _): "Too many requests to Claude. Try again in a minute."
            case .http(529, _): "Claude is busy right now. Try again in a minute."
            case let .http(code, message): "Claude answered \(code)\(message.isEmpty ? "" : ": \(message.prefix(160))")"
            case .refused: "Claude declined this one."
            case .cutOff: "Claude's answer was cut off. Try a smaller goal or task."
            case let .unexpected(what): "Unexpected answer from Claude: \(what)"
            }
        }
    }

    /// One response: why it stopped, its text, and its content blocks as
    /// sent (to resume a paused turn).
    struct Response {
        var stopReason: String
        var text: String
        var content: [[String: Any]]
    }

    // MARK: Requests

    func send(_ body: [String: Any]) async throws -> Response {
        var request = URLRequest(url: Self.endpoint, timeoutInterval: 600)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(Self.apiVersion, forHTTPHeaderField: "anthropic-version")
        request.setValue(Self.fallbackBeta, forHTTPHeaderField: "anthropic-beta")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (200..<300).contains(status) else {
            let message = (json["error"] as? [String: Any])?["message"] as? String ?? ""
            throw Failure.http(status, message)
        }
        return try Self.parse(json)
    }

    static func parse(_ json: [String: Any]) throws -> Response {
        guard let content = json["content"] as? [[String: Any]] else { throw Failure.unexpected("no content") }
        let stop = json["stop_reason"] as? String ?? ""
        if stop == "refusal" { throw Failure.refused }
        if stop == "max_tokens" { throw Failure.cutOff }
        // Only text blocks are the answer (thinking, search and fallback blocks are not).
        let text = content.filter { $0["type"] as? String == "text" }.compactMap { $0["text"] as? String }.joined()
        return Response(stopReason: stop, text: text, content: content)
    }

    /// Checks the key with a free call (the model's details).
    func checkKey() async throws {
        var request = URLRequest(url: Self.modelsEndpoint, timeoutInterval: 30)
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(Self.apiVersion, forHTTPHeaderField: "anthropic-version")
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw Failure.http(status, (json?["error"] as? [String: Any])?["message"] as? String ?? "")
        }
    }

    // MARK: Planning a project

    /// A project as Claude proposes it, before you create it.
    struct Plan: Codable, Equatable {
        var project: String
        var tasks: [PlannedTask]
    }

    struct PlannedTask: Codable, Equatable, Identifiable {
        var id = UUID()
        var title: String
        var notes: String
        var subtasks: [String]
        /// "YYYY-MM-DD".
        var date: String
        /// Ticked in the review: created when the plan is.
        var include = true

        enum CodingKeys: String, CodingKey { case title, notes, subtasks, date }
    }

    static let noteStyle = """
    Notes are plain text with light Markdown: `## ` headings, `- ` bullets, `- [ ] ` checkboxes, **bold** and _italic_. \
    No tables, no code fences, no HTML; write links as plain URLs.
    """

    static let planSystem = """
    You plan projects for Plain Week, a weekly planner for one person. Turn the user's goal into a project: a short \
    project name and the concrete tasks that complete it, in a sensible order.

    Each task is something one person can finish in one sitting, roughly 30 minutes to 3 hours. Give it a short \
    imperative title (under 60 characters), notes that say what "done" looks like and how to get there (2 to 6 lines), \
    up to 6 subtasks when the task has clear steps (otherwise none), and a date.

    Dates: from the start date onward, on weekdays unless the goal says otherwise, at most about three tasks a day, \
    and before any deadline the goal gives. Cover the whole goal; leave out busywork.

    \(noteStyle) Write in the language of the goal.
    """

    static func planSchema() -> [String: Any] {
        [
            "type": "object",
            "properties": [
                "project": ["type": "string", "description": "Short project name, under 40 characters."],
                "tasks": [
                    "type": "array",
                    "items": [
                        "type": "object",
                        "properties": [
                            "title": ["type": "string"],
                            "notes": ["type": "string"],
                            "subtasks": ["type": "array", "items": ["type": "string"]],
                            "date": ["type": "string", "format": "date"],
                        ],
                        "required": ["title", "notes", "subtasks", "date"],
                        "additionalProperties": false,
                    ],
                ],
            ],
            "required": ["project", "tasks"],
            "additionalProperties": false,
        ]
    }

    static func planRequest(goal: String, start: String, today: String) -> [String: Any] {
        let prompt = """
        Today is \(DateKey.weekdayName(today)) \(today). Start date: \(DateKey.weekdayName(start)) \(start).

        Goal:
        \(goal)
        """
        return [
            "model": model,
            "max_tokens": 16000,
            "thinking": ["type": "adaptive"],
            "output_config": ["effort": "high", "format": ["type": "json_schema", "schema": planSchema()]],
            "fallbacks": "default",
            "system": planSystem,
            "messages": [["role": "user", "content": prompt]],
        ]
    }

    static func decodePlan(_ text: String, start: String) throws -> Plan {
        guard var plan = try? JSONDecoder().decode(Plan.self, from: Data(text.utf8)) else { throw Failure.unexpected("the plan was not readable") }
        plan.project = plan.project.trimmingCharacters(in: .whitespacesAndNewlines)
        plan.tasks = plan.tasks.compactMap { task -> PlannedTask? in
            var task = task
            task.title = task.title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !task.title.isEmpty else { return nil }
            // A date that is not a day, or before the start, lands on the start.
            if !DateKey.isValid(task.date) || task.date < start { task.date = start }
            task.subtasks = task.subtasks.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
            return task
        }
        guard !plan.tasks.isEmpty else { throw Failure.unexpected("the plan had no tasks") }
        if plan.project.isEmpty { plan.project = "New project" }
        return plan
    }

    func plan(goal: String, start: String, today: String) async throws -> Plan {
        let response = try await send(Self.planRequest(goal: goal, start: start, today: today))
        return try Self.decodePlan(response.text, start: start)
    }

    // MARK: Doing a task

    static let workSystem = """
    You work on one task from the user's weekly planner, Plain Week. Do the task itself as far as it can be done in \
    writing: write the draft, do the research (with source URLs), make the checklist, the plan or the snippet. Do not \
    describe how the user could do it.

    When part of it needs the user (a decision, an account, a call, a visit), finish everything else, then list what \
    is left under a `## Left for you` heading. Search the web when facts must be current.

    Start directly with the result: no greeting, no restating the task. \(noteStyle) Write in the language of the task.
    """

    static func workRequest(task: PlainTask, project: String?) -> [String: Any] {
        var lines = ["Task: \(task.text)"]
        if let project { lines.append("Project: \(project)") }
        if let date = task.date { lines.append("Planned for: \(DateKey.weekdayName(date)) \(date)") }
        let notes = Self.withoutImages(task.notes).trimmingCharacters(in: .whitespacesAndNewlines)
        if !notes.isEmpty { lines.append("\nNotes:\n\(notes)") }
        if !task.subtasks.isEmpty {
            lines.append("\nSteps:\n" + task.subtasks.map { "- [\($0.done ? "x" : " ")] \($0.text)" }.joined(separator: "\n"))
        }
        return [
            "model": model,
            "max_tokens": 16000,
            "thinking": ["type": "adaptive"],
            "output_config": ["effort": "high"],
            "fallbacks": "default",
            "system": workSystem,
            "tools": [["type": "web_search_20260209", "name": "web_search", "max_uses": 5]],
            "messages": [["role": "user", "content": lines.joined(separator: "\n")]],
        ]
    }

    /// Image lines point at files on this Mac only: left out.
    static func withoutImages(_ notes: String) -> String {
        var out = notes
        for line in NoteImages.lines(in: notes).reversed() {
            out = (out as NSString).replacingCharacters(in: line.range, with: "")
        }
        return out
    }

    /// Does the task and returns Claude's answer as note text. A turn paused
    /// by the web search loop is resumed (a few times at most).
    func work(on task: PlainTask, project: String?) async throws -> String {
        var body = Self.workRequest(task: task, project: project)
        var answer = ""
        for _ in 0..<4 {
            let response = try await send(body)
            answer += response.text
            guard response.stopReason == "pause_turn" else { break }
            var messages = body["messages"] as? [[String: Any]] ?? []
            messages.append(["role": "assistant", "content": response.content])
            body["messages"] = messages
        }
        let text = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw Failure.unexpected("an empty answer") }
        return text
    }

    /// The answer as it goes into the notes: under a heading, after what was there.
    static func appended(_ answer: String, to notes: String, on day: String) -> String {
        let block = "## Claude · \(DateKey.shortLabel(day))\n\n\(answer)"
        let base = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        return base.isEmpty ? block : "\(notes.replacingOccurrences(of: "\\s+$", with: "", options: .regularExpression))\n\n\(block)"
    }
}

/// The keychain entry for the API key.
enum ClaudeKeychain {
    static let service = "app.plainweek.claude"
    static func read() -> String? { Keychain.read(service: service, account: "apiKey") }
    static func write(_ value: String) { Keychain.write(service: service, account: "apiKey", value) }
}

/// Claude in the app: the key, and the work in flight.
@MainActor
@Observable
final class ClaudeAssistant {
    /// A key is saved (it is never read back into the interface).
    private(set) var hasKey = !(ClaudeKeychain.read() ?? "").isEmpty
    /// Tasks Claude is working on now.
    private(set) var working: Set<String> = []

    @ObservationIgnored var session: URLSession = .shared

    private func client() throws -> ClaudeClient {
        guard let key = ClaudeKeychain.read(), !key.isEmpty else { throw ClaudeClient.Failure.noKey }
        return ClaudeClient(apiKey: key, session: session)
    }

    /// Checks the key with Anthropic, then saves it. Returns an error message, or nil.
    func saveKey(_ key: String) async -> String? {
        let key = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { return "Paste your API key first." }
        do {
            try await ClaudeClient(apiKey: key, session: session).checkKey()
        } catch {
            return error.localizedDescription
        }
        ClaudeKeychain.write(key)
        hasKey = true
        return nil
    }

    func removeKey() {
        ClaudeKeychain.write("")
        hasKey = false
    }

    func plan(goal: String, start: String, today: String) async throws -> ClaudeClient.Plan {
        try await client().plan(goal: goal, start: start, today: today)
    }

    /// Creates the plan's ticked tasks in a new project; returns its id.
    @discardableResult
    static func create(_ plan: ClaudeClient.Plan, store: TaskStore, projects: ProjectStore, undoManager: UndoManager?) -> String? {
        var name = ProjectStore.clean(plan.project)
        if name.isEmpty { name = "New project" }
        // A name already taken gets a number.
        var candidate = name
        var n = 2
        while projects.named(candidate) != nil {
            candidate = "\(name) \(n)"
            n += 1
        }
        guard let projectId = projects.create(name: candidate) else { return nil }
        store.perform("Create Project Tasks", undoManager: undoManager) {
            for task in plan.tasks where task.include {
                let subtasks = task.subtasks.map { Subtask(id: Clock.uuidV7(), text: $0, done: false) }
                _ = store.create(text: task.title, date: task.date, notes: task.notes, subtasks: subtasks, project: projectId)
            }
        }
        return projectId
    }

    func isWorking(_ id: String) -> Bool { working.contains(id) }

    /// Sends the task to Claude and adds the answer to its notes. Returns an
    /// error message, or nil.
    func work(on id: String, store: TaskStore, projects: ProjectStore, undoManager: UndoManager?) async -> String? {
        guard !working.contains(id), let item = store.item(id) else { return nil }
        working.insert(id)
        defer { working.remove(id) }
        do {
            let answer = try await client().work(on: item.task, project: projects.project(item.task.project_id)?.name)
            // The task may have changed (or gone) meanwhile: add to its notes as they are now.
            guard let current = store.item(id)?.task else { return "The task was deleted before Claude finished." }
            let notes = ClaudeClient.appended(answer, to: current.notes, on: DateKey.local())
            store.perform("Claude's Answer", undoManager: undoManager) { _ = store.update(id, TaskPatch(notes: notes)) }
            return nil
        } catch {
            return error.localizedDescription
        }
    }
}

extension DateKey {
    /// A real day written as "YYYY-MM-DD".
    static func isValid(_ key: String) -> Bool {
        guard key.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return false }
        let p = parts(key)
        guard (1...12).contains(p.month), p.day >= 1 else { return false }
        return p.day <= daysInMonth(year: p.year, month: p.month)
    }

    /// "Monday", in English (for prompts).
    static func weekdayName(_ key: String) -> String {
        ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][isoWeekday(key) - 1]
    }

    /// "12 Nov", in the user's language.
    static func shortLabel(_ key: String) -> String {
        localDate(key).formatted(.dateTime.day().month(.abbreviated))
    }
}
