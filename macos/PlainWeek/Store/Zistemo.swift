import Foundation
import Security

/// The few calls Plain Week makes to zistemo's REST API
/// (https://sandbox.zistemo.com, v1.19): the signed-in user, their time
/// tickets, ticking a ticket completed, and adding a time entry.
///
/// Every request carries the account's API developer key (zistemo profile ›
/// API, owners and admins) in the `api_dev_key` header and an access token
/// from `POST /{account}/login` (email and password; valid two hours) as
/// `Authorization: Bearer`. The account is the zistemo subdomain (`acme` for
/// acme.zistemo.com).
struct ZistemoClient {
    struct Credentials: Equatable {
        var account: String
        var devKey: String
        /// The access token from `login`, or the profile's API Token; empty
        /// before signing in.
        var token: String
        /// How the token travels. The docs allow both; some tokens are only
        /// accepted one way, so connecting tries each (see `TokenStyle`).
        var style: TokenStyle = .both

        var isComplete: Bool { !account.isEmpty && !devKey.isEmpty && !token.isEmpty }
    }

    enum TokenStyle: String, CaseIterable {
        /// `Authorization: Bearer` and `?token=`.
        case both
        /// `?token=` only.
        case query
        /// `Authorization: Bearer` only.
        case header
    }

    enum Failure: LocalizedError {
        case notConfigured
        case http(Int, String)
        case unexpected(String)

        var errorDescription: String? {
            switch self {
            case .notConfigured: "Add your zistemo address, developer key, email and password."
            case let .http(401, message): message.isEmpty ? "zistemo refused the developer key or sign-in." : "zistemo: \(message)"
            case .http(403, _): "Your zistemo role cannot use the API: ask an account owner or admin."
            case .http(429, _): "zistemo asked to slow down. Plain Week will try again later."
            case let .http(code, message): "zistemo answered \(code)\(message.isEmpty ? "" : ": \(message.prefix(140))")"
            case let .unexpected(what): "Unexpected answer from zistemo: \(what)"
            }
        }
    }

    /// A planned piece of work in zistemo's Planning: a task of a project,
    /// assigned to someone for some days.
    struct TimeTicket: Equatable {
        var id: Int
        var projectId: Int
        var taskId: Int
        var groupId: Int
        var startDate: String?
        var endDate: String?
        var hours: Double
        var notes: String
        var completed: Bool
        var projectName: String
        var taskName: String
        var groupName: String

        init?(_ json: [String: Any]) {
            guard let id = Json.int(json["id"]) else { return nil }
            self.id = id
            projectId = Json.int(json["project_id"]) ?? 0
            taskId = Json.int(json["task_id"]) ?? 0
            groupId = Json.int(json["group_id"]) ?? 0
            startDate = Json.day(json["start_date"])
            endDate = Json.day(json["end_date"])
            hours = Json.double(json["hours"]) ?? 0
            notes = Json.string(json["notes"]) ?? ""
            completed = (Json.int(json["completed"]) ?? 0) != 0
            projectName = Json.string(json["project_name"]) ?? ""
            taskName = Json.string(json["task_name"]) ?? ""
            groupName = Json.string(json["group_name"]) ?? ""
        }

        /// What the planner shows: "Web development · Create website".
        var title: String {
            [taskName, projectName].filter { !$0.isEmpty }.joined(separator: " · ")
        }
    }

    /// Time worked on a ticket, as a zistemo timesheet entry.
    struct TimeEntry: Codable, Hashable {
        var ticketId: Int
        var projectId: Int
        var taskId: Int
        var groupId: Int
        var start: Date
        var seconds: TimeInterval
        /// The task's notes when the time was recorded.
        var notes: String?
    }

    var credentials: Credentials
    var session: URLSession = .shared
    static let host = "https://api.zistemo.com"

    // MARK: Calls

    /// Signs in with email (or username) and password; returns the access token.
    static func login(account: String, devKey: String, email: String, password: String, session: URLSession = .shared) async throws -> String {
        let client = ZistemoClient(credentials: Credentials(account: account, devKey: devKey, token: ""), session: session)
        let json = try await client.send("POST", "login", form: ["email": email, "password": password], signedIn: false)
        guard let token = Json.find(["access_token", "accessToken", "token"], in: json) else { throw Failure.unexpected("no access token") }
        return token
    }

    /// The signed-in user's id (also checks the key and token).
    func currentUserId() async throws -> Int {
        let json = try await send("GET", "user/current")
        guard let object = Json.object(json), let id = Json.int(object["id"]) else { throw Failure.unexpected("no user id") }
        return id
    }

    /// The user's time tickets that touch `from`…`to` ('YYYY-MM-DD').
    func timeTickets(userId: Int, from: String, to: String) async throws -> [TimeTicket] {
        let json = try await send("GET", "time-tickets", query: ["user_id": "\(userId)", "date_from": from, "date_to": to])
        return Json.list(json).compactMap(TimeTicket.init)
    }

    func setCompleted(ticketId: Int, _ completed: Bool) async throws {
        _ = try await send("POST", "time-ticket/\(ticketId)/completed", form: ["value": completed ? "1" : "0"])
    }

    /// The ticket a live timer runs against.
    struct TimerTarget: Codable, Hashable {
        var projectId: Int
        var taskId: Int
        var groupId: Int
    }

    /// The task's notes for zistemo's note field (nothing when empty).
    static func noteText(_ notes: String?) -> String? {
        let text = (notes ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : String(text.prefix(1000))
    }

    private func timerForm(_ target: TimerTarget, notes: String?) -> [String: String] {
        var form = ["t[project_id]": "\(target.projectId)", "t[task_id]": "\(target.taskId)"]
        if let note = Self.noteText(notes) { form["t[notes]"] = note }
        if target.groupId != 0 { form["t[task_group_id]"] = "\(target.groupId)" }
        return form
    }

    /// Starts zistemo's live timer (also how a paused one goes on).
    func startTimer(_ target: TimerTarget, notes: String? = nil) async throws {
        _ = try await send("POST", "timer/start", form: timerForm(target, notes: notes))
    }

    func pauseTimer() async throws {
        _ = try await send("POST", "timer/pause")
    }

    /// Stops the live timer; zistemo adds the time to the timesheet.
    func stopTimer(_ target: TimerTarget, notes: String? = nil) async throws {
        _ = try await send("POST", "timer/stop", form: timerForm(target, notes: notes))
    }

    /// zistemo's live timer as `GET /timer/status` reports it.
    struct RemoteTimer: Equatable {
        var projectId: Int
        var taskId: Int
        var scheduleId: Int
        /// When it started (pauses not taken off: the clock here is a guide;
        /// zistemo logs the real time itself).
        var start: Date
        var paused: Bool

        /// nil when no timer runs (stopped, or no project on it).
        init?(_ json: [String: Any]) {
            if json["is_stopped"] as? Bool == true || Json.int(json["is_stopped"]) == 1 { return nil }
            let status = (Json.string(json["status"]) ?? "active").lowercased()
            guard !status.contains("stop"), let projectId = Json.int(json["project_id"]), projectId != 0 else { return nil }
            self.projectId = projectId
            taskId = Json.int(json["task_id"]) ?? 0
            scheduleId = Json.int(json["project_schedule_id"]) ?? 0
            start = Json.double(json["start_timestamp"]).map { Date(timeIntervalSince1970: $0) } ?? Date()
            paused = !["active", "running", "started", "start", "resumed"].contains(status)
        }
    }

    func timerStatus() async throws -> RemoteTimer? {
        do {
            let json = try await send("GET", "timer/status")
            return Json.object(json).flatMap(RemoteTimer.init)
        } catch Failure.http(404, _) {
            return nil
        }
    }

    /// Throws the live timer away without logging anything.
    func cancelTimer() async throws {
        _ = try await send("POST", "timer/cancel")
    }

    /// Adds `entry` to the user's timesheet, against the ticket's project and task.
    func addTime(_ entry: TimeEntry) async throws {
        let stop = entry.start.addingTimeInterval(entry.seconds)
        var form = [
            "ts[log_date]": Self.dayFormatter.string(from: entry.start),
            "ts[project_id]": "\(entry.projectId)",
            "ts[task_id]": "\(entry.taskId)",
            "ts[hours]": String(format: "%.2f", entry.seconds / 3600),
            "ts[start_time]": Self.timeFormatter.string(from: entry.start),
            "ts[stop_time]": Self.timeFormatter.string(from: stop),
            "ts[project_schedule_id]": "\(entry.ticketId)",
        ]
        if let note = Self.noteText(entry.notes) { form["ts[notes]"] = note }
        if entry.groupId != 0 { form["ts[task_group_id]"] = "\(entry.groupId)" }
        _ = try await send("POST", "timesheet", form: form)
    }

    // MARK: Transport

    private func send(_ method: String, _ path: String, query: [String: String] = [:], form: [String: String]? = nil, signedIn: Bool = true) async throws -> Any {
        guard !credentials.account.isEmpty, !credentials.devKey.isEmpty, !signedIn || !credentials.token.isEmpty,
              var components = URLComponents(string: "\(Self.host)/\(credentials.account)/\(path)") else { throw Failure.notConfigured }
        var items = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        items.append(URLQueryItem(name: "api_dev_key", value: credentials.devKey))
        // The token goes both ways the docs allow: Bearer header and `token`
        // parameter (the profile's API Token is documented with the latter).
        if signedIn, credentials.style != .header { items.append(URLQueryItem(name: "token", value: credentials.token)) }
        if !items.isEmpty { components.queryItems = items }
        guard let url = components.url else { throw Failure.notConfigured }
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(credentials.devKey, forHTTPHeaderField: "api_dev_key")
        if signedIn, credentials.style != .query { request.setValue("Bearer \(credentials.token)", forHTTPHeaderField: "Authorization") }
        if let form {
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            request.httpBody = Self.encode(form).data(using: .utf8)
        }
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = data.isEmpty ? [String: Any]() : (try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]))
        // Answers come as {"success": bool, "data": …}; errors carry data.message.
        let failed = (json as? [String: Any])?["success"] as? Bool == false
        guard (200..<300).contains(status), !failed else {
            let message = Json.find(["message"], in: json ?? [:]) ?? String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let code = (200..<300).contains(status) ? (Json.int(((json as? [String: Any])?["data"] as? [String: Any])?["status"]) ?? 400) : status
            throw Failure.http(code, message)
        }
        guard let json else { throw Failure.unexpected("not JSON") }
        return json
    }

    static func encode(_ form: [String: String]) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return form.sorted { $0.key < $1.key }
            .map { "\($0.key.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")=\($0.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")" }
            .joined(separator: "&")
    }

    static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f
    }()
}

/// Lenient reading of zistemo's JSON: ids come as numbers or strings, and a
/// list may come bare or wrapped in `data` / `items`.
enum Json {
    static func list(_ json: Any) -> [[String: Any]] {
        if let array = json as? [[String: Any]] { return array }
        if let object = json as? [String: Any] {
            for key in ["data", "items", "results", "time_tickets"] {
                if let array = object[key] as? [[String: Any]] { return array }
                if let inner = object[key] as? [String: Any] { return list(inner) }
            }
        }
        return []
    }

    /// The first string (or number) under any of `keys`, searching nested objects.
    static func find(_ keys: [String], in json: Any) -> String? {
        if let object = json as? [String: Any] {
            for key in keys {
                if let s = string(object[key]) { return s }
                if let n = int(object[key]) { return String(n) }
            }
            for value in object.values { if let found = find(keys, in: value) { return found } }
        }
        return nil
    }

    static func object(_ json: Any) -> [String: Any]? {
        guard let object = json as? [String: Any] else { return nil }
        if object["id"] == nil, let inner = object["data"] as? [String: Any] { return inner }
        return object
    }

    static func int(_ value: Any?) -> Int? {
        switch value {
        case let n as Int: n
        case let n as Double: Int(n)
        case let n as NSNumber: n.intValue
        case let s as String: Int(s)
        default: nil
        }
    }

    static func double(_ value: Any?) -> Double? {
        switch value {
        case let n as Double: n
        case let n as Int: Double(n)
        case let n as NSNumber: n.doubleValue
        case let s as String: Double(s)
        default: nil
        }
    }

    static func string(_ value: Any?) -> String? {
        guard let s = value as? String else { return nil }
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// 'YYYY-MM-DD' from "2021-05-01" or "2021-05-01 00:00:00".
    static func day(_ value: Any?) -> String? {
        guard let s = string(value), s.count >= 10 else { return nil }
        let day = String(s.prefix(10))
        return day.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil ? day : nil
    }
}

/// The zistemo developer key and API token, kept in the login keychain.
enum ZistemoKeychain {
    static let service = "app.plainweek.zistemo"

    static func read(_ account: String) -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service,
                                    kSecAttrAccount as String: account,
                                    kSecReturnData as String: true,
                                    kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ account: String, _ value: String) {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service,
                                    kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
        guard !value.isEmpty else { return }
        var add = query
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }
}
