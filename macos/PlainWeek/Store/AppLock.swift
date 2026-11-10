import AppKit
import CommonCrypto
import Foundation
import LocalAuthentication
import Observation
import Security

/// What the lock keeps on disk (`lock.json` next to `tasks.json`): salted
/// PBKDF2 hashes of the password and the secret answer, never the text.
struct LockSecrets: Codable, Equatable {
    var passwordHash: Data
    var passwordSalt: Data
    var question: String
    var answerHash: Data
    var answerSalt: Data
    var rounds: Int
    var idleMinutes: Int
}

/// Hashing for the lock: PBKDF2-SHA256 with a random salt per secret.
enum Secret {
    static let rounds = 210_000

    static func salt() -> Data {
        var bytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes)
    }

    static func hash(_ text: String, salt: Data, rounds: Int) -> Data {
        let password = Array(text.utf8).map { Int8(bitPattern: $0) }
        var out = [UInt8](repeating: 0, count: 32)
        let saltBytes = [UInt8](salt)
        CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), password, password.count, saltBytes, saltBytes.count,
                             CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), UInt32(rounds), &out, out.count)
        return Data(out)
    }

    /// Compares in constant time.
    static func matches(_ text: String, hash: Data, salt: Data, rounds: Int) -> Bool {
        let candidate = Self.hash(text, salt: salt, rounds: rounds)
        guard candidate.count == hash.count else { return false }
        return zip(candidate, hash).reduce(0) { $0 | ($1.0 ^ $1.1) } == 0
    }

    /// Answers match however they are typed: case, accents and spacing aside.
    static func normalizeAnswer(_ answer: String) -> String {
        answer.folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: nil)
            .split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
}

/// Locks Plain Week behind its own password: after some minutes without use
/// (5 by default), when the Mac sleeps or its screen locks, and at launch.
/// A forgotten password is reset after answering the secret question and then
/// confirming with Touch ID or the Mac's login password.
@MainActor
@Observable
final class AppLock {
    static let idleChoices = [1, 5, 15, 30, 60]
    static let minimumPasswordLength = 4
    /// Wrong passwords allowed before each further try waits.
    static let freeAttempts = 5
    static let waitSeconds: TimeInterval = 30

    enum Recovery: Equatable {
        case none
        /// Answer the secret question.
        case question
        /// Answered; waiting for Touch ID or the Mac password.
        case confirming
        /// Both passed: choose a new password.
        case newPassword
    }

    private(set) var secrets: LockSecrets?
    private(set) var isLocked = false
    private(set) var recovery: Recovery = .none
    private(set) var lockedOutUntil: Date?

    @ObservationIgnored private let fileURL: URL?
    @ObservationIgnored private var failedAttempts = 0
    @ObservationIgnored private var lastActivity = Date()
    @ObservationIgnored private var monitor: Any?
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored var now: () -> Date = Date.init
    /// Called on locking, to close sheets that would show tasks.
    @ObservationIgnored var onLock: (() -> Void)?

    init(fileURL: URL?) {
        self.fileURL = fileURL
        if let fileURL, let data = try? Data(contentsOf: fileURL) {
            secrets = try? JSONDecoder().decode(LockSecrets.self, from: data)
        }
        isLocked = secrets != nil
    }

    var isEnabled: Bool { secrets != nil }
    var question: String { secrets?.question ?? "" }
    var idleMinutes: Int { secrets?.idleMinutes ?? 5 }

    // MARK: Setting up

    func setUp(password: String, question: String, answer: String, idleMinutes: Int = 5, rounds: Int = Secret.rounds) {
        let passwordSalt = Secret.salt(), answerSalt = Secret.salt()
        secrets = LockSecrets(passwordHash: Secret.hash(password, salt: passwordSalt, rounds: rounds), passwordSalt: passwordSalt,
                              question: question.trimmingCharacters(in: .whitespacesAndNewlines),
                              answerHash: Secret.hash(Secret.normalizeAnswer(answer), salt: answerSalt, rounds: rounds), answerSalt: answerSalt,
                              rounds: rounds, idleMinutes: idleMinutes)
        save()
        lastActivity = now()
    }

    func checkPassword(_ password: String) -> Bool {
        guard let s = secrets else { return false }
        return Secret.matches(password, hash: s.passwordHash, salt: s.passwordSalt, rounds: s.rounds)
    }

    /// Settings: a new password, given the current one.
    func changePassword(current: String, new: String) -> Bool {
        guard checkPassword(current) else { return false }
        setPassword(new)
        return true
    }

    func changeQuestion(password: String, question: String, answer: String) -> Bool {
        guard checkPassword(password), var s = secrets else { return false }
        let salt = Secret.salt()
        s.question = question.trimmingCharacters(in: .whitespacesAndNewlines)
        s.answerSalt = salt
        s.answerHash = Secret.hash(Secret.normalizeAnswer(answer), salt: salt, rounds: s.rounds)
        secrets = s
        save()
        return true
    }

    func setIdleMinutes(_ minutes: Int) {
        guard var s = secrets else { return }
        s.idleMinutes = minutes
        secrets = s
        save()
    }

    /// Turns the lock off (the password is needed).
    func turnOff(password: String) -> Bool {
        guard checkPassword(password) else { return false }
        secrets = nil
        isLocked = false
        if let fileURL { try? FileManager.default.removeItem(at: fileURL) }
        return true
    }

    private func setPassword(_ password: String) {
        guard var s = secrets else { return }
        let salt = Secret.salt()
        s.passwordSalt = salt
        s.passwordHash = Secret.hash(password, salt: salt, rounds: s.rounds)
        secrets = s
        save()
    }

    private func save() {
        guard let fileURL else { return }
        guard let secrets, let data = try? JSONEncoder().encode(secrets) else { return }
        try? data.write(to: fileURL, options: .atomic)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: fileURL.path)
    }

    // MARK: Locking

    func lock() {
        guard isEnabled, !isLocked else { return }
        isLocked = true
        recovery = .none
        onLock?()
    }

    enum UnlockResult: Equatable { case unlocked, wrong, wait(Int) }

    /// Wrong passwords past the first five make the next try wait 30 seconds.
    func unlock(password: String) -> UnlockResult {
        if let until = lockedOutUntil, until > now() { return .wait(Int(until.timeIntervalSince(now()).rounded(.up))) }
        guard checkPassword(password) else {
            failedAttempts += 1
            if failedAttempts >= Self.freeAttempts { lockedOutUntil = now().addingTimeInterval(Self.waitSeconds) }
            return .wrong
        }
        open()
        return .unlocked
    }

    private func open() {
        failedAttempts = 0
        lockedOutUntil = nil
        recovery = .none
        isLocked = false
        lastActivity = now()
    }

    // MARK: Recovery: secret question, then Touch ID or the Mac password

    func startRecovery() { recovery = .question }
    func cancelRecovery() { recovery = .none }

    /// Checks the answer (throttled like the password). True moves on to
    /// confirming with Touch ID or the Mac password.
    func answer(_ text: String) -> UnlockResult {
        guard recovery == .question, let s = secrets else { return .wrong }
        if let until = lockedOutUntil, until > now() { return .wait(Int(until.timeIntervalSince(now()).rounded(.up))) }
        guard Secret.matches(Secret.normalizeAnswer(text), hash: s.answerHash, salt: s.answerSalt, rounds: s.rounds) else {
            failedAttempts += 1
            if failedAttempts >= Self.freeAttempts { lockedOutUntil = now().addingTimeInterval(Self.waitSeconds) }
            return .wrong
        }
        failedAttempts = 0
        recovery = .confirming
        return .unlocked
    }

    /// Asks macOS for Touch ID or the login password. Returns an error to show.
    func confirmOwner() async -> String? {
        guard recovery == .confirming else { return nil }
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            recovery = .question
            return error?.localizedDescription ?? "This Mac cannot confirm it is you."
        }
        do {
            try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "reset your Plain Week password")
            recoveryConfirmed()
            return nil
        } catch {
            recovery = .question
            return (error as? LAError)?.code == .userCancel ? nil : error.localizedDescription
        }
    }

    /// Internal so tests can stand in for Touch ID.
    func recoveryConfirmed() {
        guard recovery == .confirming else { return }
        recovery = .newPassword
    }

    /// Sets the new password and unlocks; only after the question and the
    /// owner check both passed.
    func resetPassword(_ password: String) -> Bool {
        guard recovery == .newPassword, password.count >= Self.minimumPasswordLength else { return false }
        setPassword(password)
        open()
        return true
    }

    // MARK: Idle and sleep

    func start() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .leftMouseDown, .rightMouseDown, .scrollWheel, .mouseMoved]) { [weak self] event in
            self?.lastActivity = Date()
            return event
        }
        timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.checkIdle() }
        }
        let workspace = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.willSleepNotification, NSWorkspace.screensDidSleepNotification, NSWorkspace.sessionDidResignActiveNotification] {
            workspace.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.lock() }
            }
        }
        DistributedNotificationCenter.default().addObserver(forName: .init("com.apple.screenIsLocked"), object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.lock() }
        }
    }

    /// Locks once Plain Week has gone unused for the chosen minutes.
    func checkIdle() {
        guard isEnabled, !isLocked, now().timeIntervalSince(lastActivity) >= TimeInterval(idleMinutes * 60) else { return }
        lock()
    }

    func noteActivity() { lastActivity = now() }
}
