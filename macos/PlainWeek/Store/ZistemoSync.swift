import Foundation
import Observation

/// Brings your zistemo time tickets (Planning) into the planner and keeps
/// them in step, from this Mac only:
///
/// - Each open ticket assigned to you, from two weeks ago to six weeks ahead,
///   becomes a task tagged #zistemo on its start day (today when it started
///   earlier). Removing the task here leaves the ticket alone.
/// - Ticking the task completes the ticket, and the other way round (the
///   side that changed since the last sync wins).
/// - Focus timer time on the task goes to your zistemo timesheet against the
///   ticket's project and task, once a pause or stop records it.
///
/// Offline-first: the planner never waits on zistemo. Links, last-known
/// states and time not yet sent live in `zistemo.json` next to the tasks
/// (local to this Mac, not part of the task contract), and anything that
/// fails is sent again at the next sync.
@MainActor
@Observable
final class ZistemoSync {
    static let enabledKey = "zistemoSync"
    static let accountKey = "zistemoAccount"
    static let emailKey = "zistemoEmail"
    static let tokenStyleKey = "zistemoTokenStyle"
    /// Access tokens last two hours; sign in again a little before.
    static let tokenLifetime: TimeInterval = 110 * 60
    static let tag = "zistemo"
    /// Shorter timer runs stay on this Mac only (zistemo logs hours).
    static let minimumSeconds: TimeInterval = 60

    /// A task that stands for a ticket, and the states both sides had when
    /// they last agreed.
    struct Link: Codable, Hashable {
        var ticketId: Int
        var projectId: Int
        var taskId: Int
        var groupId: Int
        var remoteCompleted: Bool
        var localDone: Bool
        /// The task was put in its zistemo project's Plain Week project once
        /// (moving it elsewhere afterwards sticks). nil in older files.
        var filed: Bool?
    }

    /// zistemo's live timer, while the focus timer runs on a linked task.
    struct Live: Codable, Hashable {
        var taskId: String
        var target: ZistemoClient.TimerTarget
        var paused: Bool
        /// Focus time recorded meanwhile. zistemo logs the time itself when
        /// its timer stops, so these are only sent if that fails.
        var segments: [ZistemoClient.TimeEntry]
    }

    struct State: Codable {
        /// Plain Week task id → its ticket.
        var links: [String: Link] = [:]
        /// Time entries not yet accepted by zistemo, oldest first.
        var pending: [ZistemoClient.TimeEntry] = []
        var userId: Int?
        var live: Live?
        /// A live timer was left behind (a call failed, or the app quit while
        /// it ran): throw it away at the next chance, its time is in `pending`.
        var cancelRemote = false

        init() {}

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            links = try c.decodeIfPresent([String: Link].self, forKey: .links) ?? [:]
            pending = try c.decodeIfPresent([ZistemoClient.TimeEntry].self, forKey: .pending) ?? []
            userId = try c.decodeIfPresent(Int.self, forKey: .userId)
            live = try c.decodeIfPresent(Live.self, forKey: .live)
            cancelRemote = try c.decodeIfPresent(Bool.self, forKey: .cancelRemote) ?? false
        }
    }

    private(set) var isEnabled = UserDefaults.standard.bool(forKey: ZistemoSync.enabledKey)
    private(set) var account = UserDefaults.standard.string(forKey: ZistemoSync.accountKey) ?? ""
    private(set) var email = UserDefaults.standard.string(forKey: ZistemoSync.emailKey) ?? ""
    private(set) var lastSync: Date?
    private(set) var lastError: String?
    private(set) var isSyncing = false
    private(set) var state = State()

    @ObservationIgnored private let store: TaskStore
    @ObservationIgnored private let projects: ProjectStore?
    @ObservationIgnored private let fileURL: URL?
    @ObservationIgnored private var pendingWork: DispatchWorkItem?
    /// Set while this class changes tasks, so its own saves do not schedule
    /// another sync.
    @ObservationIgnored private var applying = false
    @ObservationIgnored var session: URLSession = .shared
    @ObservationIgnored private var token: String?
    @ObservationIgnored private var tokenDate: Date?

    init(store: TaskStore, projects: ProjectStore? = nil, fileURL: URL?) {
        self.store = store
        self.projects = projects
        self.fileURL = fileURL
        if let fileURL, let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode(State.self, from: data) {
            state = saved
        }
        // The focus timer does not survive a quit: a live timer left from
        // the last run is cancelled and its recorded time sent instead.
        if state.live != nil { abandonLive() }
    }

    /// A client with a fresh access token, signing in when needed.
    private func client(renew: Bool = false) async throws -> ZistemoClient {
        let devKey = ZistemoKeychain.read("devKey") ?? ""
        // The API Token from the zistemo profile does not expire: no sign-in.
        if let apiToken = ZistemoKeychain.read("apiToken"), !apiToken.isEmpty {
            let style = ZistemoClient.TokenStyle(rawValue: UserDefaults.standard.string(forKey: Self.tokenStyleKey) ?? "") ?? .both
            return ZistemoClient(credentials: .init(account: account, devKey: devKey, token: apiToken, style: style), session: session)
        }
        if renew || token == nil || Date().timeIntervalSince(tokenDate ?? .distantPast) > Self.tokenLifetime {
            guard let password = ZistemoKeychain.read("password"), !email.isEmpty, !devKey.isEmpty else { throw ZistemoClient.Failure.notConfigured }
            token = try await ZistemoClient.login(account: account, devKey: devKey, email: email, password: password, session: session)
            tokenDate = Date()
        }
        return ZistemoClient(credentials: .init(account: account, devKey: devKey, token: token ?? ""), session: session)
    }

    /// Runs `body`, signing in again once if zistemo says the token expired.
    private func withClient<T>(_ body: (ZistemoClient) async throws -> T) async throws -> T {
        do { return try await body(client()) } catch ZistemoClient.Failure.http(401, _) {
            return try await body(client(renew: true))
        }
    }

    var linkedCount: Int { state.links.count }
    var unsentSeconds: TimeInterval { state.pending.reduce(0) { $0 + $1.seconds } }

    func isLinked(_ taskId: String) -> Bool { state.links[taskId] != nil }

    // MARK: Setup

    /// Signs in to zistemo and, if that works, saves the details (the key and
    /// password in the keychain), turns the sync on and runs it. Returns an
    /// error message, or nil.
    /// Either `apiToken` (the profile's API Token) or `email` and `password`.
    func connect(account: String, devKey: String, apiToken: String = "", email: String, password: String) async -> String? {
        let account = Self.cleanAccount(account)
        let devKey = devKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let apiToken = apiToken.trimmingCharacters(in: .whitespacesAndNewlines)
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !account.isEmpty, !devKey.isEmpty, !apiToken.isEmpty || (!email.isEmpty && !password.isEmpty) else {
            return ZistemoClient.Failure.notConfigured.localizedDescription
        }
        do {
            let token = apiToken.isEmpty
                ? try await ZistemoClient.login(account: account, devKey: devKey, email: email, password: password, session: session)
                : apiToken
            // A token from login works as documented; the profile's API Token
            // may only be accepted one way, so try each.
            var userId: Int?
            var style = ZistemoClient.TokenStyle.both
            var lastFailure: Error?
            for candidate in apiToken.isEmpty ? [.both] : ZistemoClient.TokenStyle.allCases {
                let creds = ZistemoClient.Credentials(account: account, devKey: devKey, token: token, style: candidate)
                do {
                    userId = try await ZistemoClient(credentials: creds, session: session).currentUserId()
                    style = candidate
                    break
                } catch ZistemoClient.Failure.http(401, let message) {
                    lastFailure = ZistemoClient.Failure.http(401, message)
                }
            }
            guard let userId else {
                let reason = lastFailure?.localizedDescription ?? "zistemo refused the sign-in."
                return apiToken.isEmpty ? reason : "\(reason) zistemo did not accept the API token: clear it and use your email and password instead."
            }
            UserDefaults.standard.set(style.rawValue, forKey: Self.tokenStyleKey)
            ZistemoKeychain.write("devKey", devKey)
            ZistemoKeychain.write("apiToken", apiToken)
            ZistemoKeychain.write("password", apiToken.isEmpty ? password : "")
            UserDefaults.standard.set(account, forKey: Self.accountKey)
            UserDefaults.standard.set(apiToken.isEmpty ? email : "", forKey: Self.emailKey)
            UserDefaults.standard.set(true, forKey: Self.enabledKey)
            if state.userId != userId { state.links = [:] }
            state.userId = userId
            self.account = account
            self.email = apiToken.isEmpty ? email : ""
            self.token = token
            tokenDate = Date()
            isEnabled = true
            save()
            await sync()
            startPolling()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    /// Stops syncing and forgets the key and password. Tasks stay as they are.
    func disconnect() {
        pendingWork?.cancel()
        ZistemoKeychain.write("devKey", "")
        ZistemoKeychain.write("password", "")
        ZistemoKeychain.write("apiToken", "")
        UserDefaults.standard.set(false, forKey: Self.enabledKey)
        isEnabled = false
        lastError = nil
        token = nil
        state.live = nil
        poller?.invalidate()
        poller = nil
        save()
    }

    /// "acme" from "acme", "acme.zistemo.com" or "https://acme.zistemo.com/…".
    static func cleanAccount(_ text: String) -> String {
        var s = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let range = s.range(of: "://") { s = String(s[range.upperBound...]) }
        s = String(s.prefix { $0 != "/" })
        if s.hasSuffix(".zistemo.com") { s = String(s.dropLast(".zistemo.com".count)) }
        return s
    }

    // MARK: Sync

    /// After a local save: syncs soon if a linked task was ticked or unticked.
    func scheduleSoon() {
        guard isEnabled, !applying, hasLocalChanges else { return }
        pendingWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.syncNow() }
        pendingWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: work)
    }

    private var hasLocalChanges: Bool {
        state.links.contains { id, link in
            guard let task = store.item(id)?.task else { return false }
            return task.done != link.localDone
        }
    }

    func syncNow() {
        Task { await sync() }
    }

    func sync() async {
        guard isEnabled, !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }
        do {
            let userId: Int
            if let known = state.userId { userId = known } else {
                userId = try await withClient { try await $0.currentUserId() }
                state.userId = userId
            }
            let today = DateKey.local()
            let tickets = try await withClient { try await $0.timeTickets(userId: userId, from: DateKey.addDays(today, -14), to: DateKey.addDays(today, 42)) }
            let pushes = reconcile(tickets, today: today)
            save()
            for push in pushes {
                try await withClient { try await $0.setCompleted(ticketId: push.ticketId, push.done) }
                state.links[push.taskId]?.remoteCompleted = push.done
                state.links[push.taskId]?.localDone = push.done
                save()
            }
            if state.cancelRemote, state.live == nil {
                try await withClient { try await $0.cancelTimer() }
                state.cancelRemote = false
                save()
            }
            try await sendTime()
            lastSync = Date()
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    struct Push: Equatable {
        var taskId: String
        var ticketId: Int
        var done: Bool
    }

    /// Applies zistemo's tickets to the planner and returns the completions
    /// to send back. Pure apart from the store and `state`, for tests.
    func reconcile(_ tickets: [ZistemoClient.TimeTicket], today: String) -> [Push] {
        applying = true
        defer { applying = false }
        var byTicket: [Int: String] = [:]
        for (taskId, link) in state.links { byTicket[link.ticketId] = taskId }
        var pushes: [Push] = []

        for ticket in tickets {
            if let taskId = byTicket[ticket.id], var link = state.links[taskId] {
                link.projectId = ticket.projectId
                link.taskId = ticket.taskId
                link.groupId = ticket.groupId
                // Removed here: leave the ticket and keep the link, so it
                // does not come back.
                guard let task = store.item(taskId)?.task else { state.links[taskId] = link; continue }
                // Tasks from before projects: into their zistemo project, once.
                if link.filed != true {
                    if task.project_id == nil, let project = project(for: ticket) {
                        store.update(taskId, TaskPatch(project: .some(project)))
                    }
                    link.filed = true
                }
                if ticket.completed != link.remoteCompleted {
                    if task.done != ticket.completed { store.update(taskId, TaskPatch(done: ticket.completed)) }
                    link.remoteCompleted = ticket.completed
                    link.localDone = ticket.completed
                } else if task.done != link.localDone {
                    pushes.append(Push(taskId: taskId, ticketId: ticket.id, done: task.done))
                }
                state.links[taskId] = link
            } else if !ticket.completed {
                let start = ticket.startDate ?? today
                let date = start < today ? today : start
                // In a project the name says which project: the title is the task.
                let base = projects != nil && !ticket.projectName.isEmpty && !ticket.taskName.isEmpty ? ticket.taskName : ticket.title
                let title = base.isEmpty ? "zistemo ticket \(ticket.id)" : base
                var notes = ticket.notes
                if !ticket.groupName.isEmpty { notes = notes.isEmpty ? ticket.groupName : "\(ticket.groupName)\n\n\(notes)" }
                let id = store.create(text: title, date: date, tags: [Self.tag], notes: notes, project: project(for: ticket))
                state.links[id] = Link(ticketId: ticket.id, projectId: ticket.projectId, taskId: ticket.taskId,
                                       groupId: ticket.groupId, remoteCompleted: false, localDone: false, filed: true)
            }
        }
        return pushes
    }

    /// The Plain Week project named after the ticket's zistemo project
    /// (created the first time it is needed).
    private func project(for ticket: ZistemoClient.TimeTicket) -> String? {
        guard let projects, !ticket.projectName.isEmpty else { return nil }
        return projects.findOrCreate(ticket.projectName)
    }

    // MARK: Time

    /// From the focus timer: time worked on a task. Kept aside while
    /// zistemo's live timer counts it; otherwise queued for the timesheet.
    func logTime(_ taskId: String, seconds: TimeInterval, start: Date) {
        guard isEnabled, let link = state.links[taskId] else { return }
        let entry = ZistemoClient.TimeEntry(ticketId: link.ticketId, projectId: link.projectId, taskId: link.taskId,
                                            groupId: link.groupId, start: start, seconds: seconds.rounded(),
                                            notes: store.item(taskId)?.task.notes)
        if following { return }
        if state.live?.taskId == taskId {
            state.live?.segments.append(entry)
            save()
            return
        }
        guard seconds >= Self.minimumSeconds else { return }
        state.pending.append(entry)
        save()
        Task {
            do { try await sendTime() } catch { lastError = error.localizedDescription }
        }
    }

    var isLive: Bool { state.live != nil && state.live?.paused == false }

    @ObservationIgnored private var timerChain: Task<Void, Never>?
    /// Timer calls queued or running, and when the last one began: a status
    /// read meanwhile may not show it yet.
    @ObservationIgnored private var timerCalls = 0
    @ObservationIgnored private var lastTimerCall = Date.distantPast
    /// Set while Plain Week's timer follows zistemo's, so those changes are
    /// not sent back (and their time not logged: zistemo logs it).
    @ObservationIgnored private var following = false
    /// The focus timer, to follow a timer started in zistemo.
    @ObservationIgnored weak var timer: FocusTimer?
    @ObservationIgnored private var poller: Timer?
    static let pollSeconds: TimeInterval = 60

    /// From the focus timer, after each change: runs, pauses or stops
    /// zistemo's live timer to match (calls run one after another).
    func timerChanged(taskId: String?, working: Bool) {
        guard isEnabled, !following else { return }
        let previous = timerChain
        timerCalls += 1
        timerChain = Task {
            await previous?.value
            await applyTimer(taskId: taskId, working: working)
            timerCalls -= 1
        }
    }

    private func applyTimer(taskId: String?, working: Bool) async {
        guard isEnabled else { return }
        lastTimerCall = Date()
        let link = taskId.flatMap { state.links[$0] }
        if let live = state.live, live.taskId != taskId || link == nil {
            do {
                try await withClient { try await $0.stopTimer(live.target, notes: self.store.item(live.taskId)?.task.notes) }
                state.live = nil
                save()
            } catch { abandonLive(error) }
        }
        guard let taskId, let link else { return }
        let target = ZistemoClient.TimerTarget(projectId: link.projectId, taskId: link.taskId, groupId: link.groupId)
        if let live = state.live {
            guard live.paused == working else { return }
            do {
                if working { try await withClient { try await $0.startTimer(target, notes: self.store.item(taskId)?.task.notes) } } else { try await withClient { try await $0.pauseTimer() } }
                state.live?.paused = !working
                save()
            } catch { abandonLive(error) }
        } else if working {
            if state.cancelRemote {
                try? await withClient { try await $0.cancelTimer() }
                state.cancelRemote = false
            }
            // Set first, so time recorded while the call runs is kept aside.
            state.live = Live(taskId: taskId, target: target, paused: false, segments: [])
            save()
            do { try await withClient { try await $0.startTimer(target, notes: self.store.item(taskId)?.task.notes) } } catch { abandonLive(error) }
        }
    }

    // MARK: Following zistemo's timer

    /// Checks zistemo's timer now and then every minute while the sync is on.
    func startPolling() {
        poller?.invalidate()
        poller = nil
        guard isEnabled else { return }
        poller = Timer.scheduledTimer(withTimeInterval: Self.pollSeconds, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.pollTimer() }
        }
        Task { await pollTimer() }
    }

    /// Reads zistemo's timer and makes Plain Week's match it: a timer started,
    /// paused, resumed, switched or stopped in zistemo does the same here.
    func pollTimer() async {
        guard isEnabled, timerCalls == 0, Date().timeIntervalSince(lastTimerCall) > 15 else { return }
        let remote: ZistemoClient.RemoteTimer?
        do { remote = try await withClient { try await $0.timerStatus() } } catch {
            return // No answer (offline) is not "stopped".
        }
        // A timer call may have started while reading.
        guard timerCalls == 0, Date().timeIntervalSince(lastTimerCall) > 15 else { return }
        follow(remote)
    }

    /// The task a zistemo timer belongs to: its ticket, else an open task of
    /// the same project and task (today's first).
    func linkedTask(for remote: ZistemoClient.RemoteTimer) -> String? {
        if remote.scheduleId != 0, let match = state.links.first(where: { $0.value.ticketId == remote.scheduleId }),
           store.item(match.key) != nil { return match.key }
        let today = DateKey.local()
        return state.links
            .filter { $0.value.projectId == remote.projectId && $0.value.taskId == remote.taskId }
            .compactMap { id, _ in store.item(id).map { (id, $0.task) } }
            .filter { !$0.1.done }
            .sorted { ($0.1.date == today ? 0 : 1, $0.1.date ?? "") < ($1.1.date == today ? 0 : 1, $1.1.date ?? "") }
            .first?.0
    }

    func follow(_ remote: ZistemoClient.RemoteTimer?) {
        guard let timer, timerCalls == 0 else { return }
        following = true
        defer { following = false }
        guard let remote, let taskId = linkedTask(for: remote), let link = state.links[taskId] else {
            // Stopped in zistemo (or moved to work Plain Week does not have).
            if let live = state.live {
                state.live = nil
                save()
                if timer.taskId == live.taskId { timer.stop() }
            }
            return
        }
        let target = ZistemoClient.TimerTarget(projectId: link.projectId, taskId: link.taskId, groupId: link.groupId)
        if state.live?.taskId != taskId || timer.taskId != taskId {
            state.live = Live(taskId: taskId, target: target, paused: remote.paused, segments: [])
            save()
            timer.start(taskId, day: DateKey.local(), mode: .stopwatch, since: remote.start)
            if remote.paused { timer.pause() }
        } else if remote.paused == timer.isWorking, !(remote.paused && timer.isRunning && !timer.isWorking) {
            // (A Pomodoro break pauses zistemo's timer on purpose: left alone.)
            if remote.paused { timer.pause() } else { timer.resume() }
            state.live?.paused = remote.paused
            save()
        }
    }

    /// A live timer call failed (offline, or zistemo said no): fall back to
    /// timesheet entries for the time recorded, and cancel zistemo's timer later.
    private func abandonLive(_ error: Error? = nil) {
        if let error { lastError = error.localizedDescription }
        guard let live = state.live else { return }
        state.pending += live.segments.filter { $0.seconds >= 1 }
        state.live = nil
        state.cancelRemote = true
        save()
    }

    @ObservationIgnored private var sendingTime = false

    private func sendTime() async throws {
        guard !sendingTime else { return }
        sendingTime = true
        defer { sendingTime = false }
        while let entry = state.pending.first {
            try await withClient { try await $0.addTime(entry) }
            state.pending.removeFirst()
            save()
        }
    }

    private func save() {
        guard let fileURL, let data = try? JSONEncoder().encode(state) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
