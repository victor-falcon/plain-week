import ServiceManagement
import SwiftUI

/// The Settings window: a sidebar of panes, and on the right the chosen
/// pane's title, a line on what it is for, and grouped cards of rows (name and
/// a grey line of detail, the control on the right). Black and white, like the
/// planner.
struct SettingsView: View {
    @State private var paneId = Self.initialPane

    private static var initialPane: String {
        #if DEBUG
        if let pane = ProcessInfo.processInfo.environment["PLAINWEEK_SNAPSHOT_SETTINGS"] { return pane }
        #endif
        return SettingsPane.general.rawValue
    }
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(CalendarEvents.self) private var calendar

    var body: some View {
        Group {
            if AppModel.shared.lock.isLocked {
                // Settings could export tasks or turn the lock off: not while locked.
                VStack(spacing: 14) {
                    LockedNotice(text: "Unlock Plain Week to change its settings.")
                    Button("Show Plain Week") { TimerActions.showPlanner() }.buttonStyle(PillButtonStyle())
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.background)
            } else {
                HStack(spacing: 0) {
                    sidebar
                    Rectangle().fill(Theme.border).frame(width: 1)
                    ScrollView {
                        content.padding(.horizontal, 48).padding(.top, 44).padding(.bottom, 40)
                    }
                    .background(Theme.background)
                }
            }
        }
        .frame(width: 860, height: 620)
        .ignoresSafeArea(.container, edges: .top)
        .background(SettingsWindowStyle())
        .focusEffectDisabled()
    }

    private var pane: SettingsPane { SettingsPane(rawValue: paneId) ?? .general }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(SettingsPane.groups, id: \.title) { group in
                Text(group.title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.mutedForeground)
                    .padding(.horizontal, 12)
                    .padding(.top, group.title == SettingsPane.groups[0].title ? 0 : 18)
                    .padding(.bottom, 6)
                ForEach(group.panes) { item in
                    Button { paneId = item.rawValue } label: {
                        HStack(spacing: 10) {
                            Image(systemName: item.icon)
                                .font(.system(size: 13, weight: .medium))
                                .frame(width: 18)
                                .foregroundStyle(item == pane ? Theme.foreground : Theme.mutedForeground)
                            Text(item.title).font(.system(size: 14, weight: item == pane ? .semibold : .regular))
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 12)
                        .frame(height: 34)
                        .background(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous)
                            .fill(item == pane ? Theme.hover : .clear))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.pressable)
                }
            }
            Spacer()
            Text("Plain Week \(DataTransfer.appVersion)")
                .font(.system(size: 12))
                .foregroundStyle(Theme.mutedForeground)
                .padding(.horizontal, 12)
        }
        .padding(.horizontal, 12)
        .padding(.top, 52)
        .padding(.bottom, 16)
        .frame(width: 220)
        .sidebarSurface()
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(pane.title).font(Theme.heading).tracking(-0.6)
            Text(pane.subtitle)
                .font(.system(size: 14))
                .foregroundStyle(Theme.mutedForeground)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 32) {
                switch pane {
                case .general: GeneralPane()
                case .planner: PlannerPane()
                case .timer: TimerPane()
                case .notifications: NotificationsPane()
                case .sync: SyncPane()
                case .privacy: PrivacyPane()
                case .data: DataPane()
                }
            }
            .padding(.top, 32)
        }
        .frame(maxWidth: 620, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        .id(pane)
    }
}

enum SettingsPane: String, CaseIterable, Identifiable {
    case general, planner, timer, notifications, sync, privacy, data
    var id: String { rawValue }

    static let groups: [(title: String, panes: [SettingsPane])] = [
        ("Plain Week", [.general, .planner, .timer, .notifications]),
        ("Your data", [.sync, .privacy, .data]),
    ]

    var title: String {
        switch self {
        case .general: "General"
        case .planner: "Planner"
        case .timer: "Timer"
        case .notifications: "Notifications"
        case .sync: "Sync"
        case .privacy: "Privacy"
        case .data: "Data"
        }
    }

    var subtitle: String {
        switch self {
        case .general: "How Plain Week looks, starts and reaches you from other apps."
        case .planner: "What the week does on its own each day."
        case .timer: "The stopwatch or Pomodoro started from a day's ▶."
        case .notifications: "Reminders for tasks with a time."
        case .sync: "Your week on your other Macs, and in Reminders and Calendar."
        case .privacy: "Keep your week behind a password."
        case .data: "Export, import, clean-up, paper and daily backups."
        }
    }

    var icon: String {
        switch self {
        case .general: "gearshape"
        case .planner: "calendar"
        case .timer: "timer"
        case .notifications: "bell"
        case .sync: "arrow.triangle.2.circlepath"
        case .privacy: "lock"
        case .data: "externaldrive"
        }
    }
}

// MARK: Parts

/// A titled group of rows on a rounded card, with an optional note under it.
private struct SettingsGroup<Content: View>: View {
    var title: String?
    var footer: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title { Text(title).font(.system(size: 15, weight: .semibold)) }
            // Each row draws a hairline on its top edge; the first one sits
            // above the card and is clipped away (works on macOS 14).
            VStack(spacing: 0) { content }
                .padding(.top, -1)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.card))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border))
            if let footer {
                Text(footer)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 4)
            }
        }
    }
}

/// One row: the setting's name and a grey line on what it does; the control
/// on the right.
private struct SettingsRow<Trailing: View>: View {
    var title: String
    var detail: String?
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 24) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.system(size: 14, weight: .medium))
                    .accessibilityAddTraits(.isHeader)
                if let detail {
                    Text(detail)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            // Switches and pickers take the row's name for VoiceOver (their
            // own labels are hidden to keep the row clean).
            trailing.environment(\.settingsRowTitle, title)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .frame(minHeight: 56)
        .overlay(alignment: .top) { Rectangle().fill(Theme.border).frame(height: 1) }
    }
}

extension SettingsRow where Trailing == EmptyView {
    init(title: String, detail: String? = nil) {
        self.init(title: title, detail: detail) { EmptyView() }
    }
}

private struct SettingsRowTitleKey: EnvironmentKey { static let defaultValue = "" }

extension EnvironmentValues {
    var settingsRowTitle: String {
        get { self[SettingsRowTitleKey.self] }
        set { self[SettingsRowTitleKey.self] = newValue }
    }
}

/// Names a row's switch or picker after the row, for VoiceOver.
private struct RowLabel: ViewModifier {
    @Environment(\.settingsRowTitle) private var title
    func body(content: Content) -> some View {
        content.accessibilityLabel(Text(title))
    }
}

/// The black-and-white switch on its own, for the right of a row.
private struct RowSwitch: View {
    @Binding var isOn: Bool
    var body: some View {
        Toggle(isOn: $isOn) { EmptyView() }
            .toggleStyle(MonoSwitchStyle())
            .labelsHidden()
            .modifier(RowLabel())
            .fixedSize()
    }
}

/// The Settings window runs its content under a clear title bar, so the
/// sidebar reaches the top like the planner's.
private struct SettingsWindowStyle: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.styleMask.insert(.fullSizeContentView)
            window.toolbar = nil
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

// MARK: Panes

private struct GeneralPane: View {
    @AppStorage("appearance") private var appearance = Appearance.system.rawValue
    @AppStorage(QuickCapture.enabledKey) private var quickCapture = true
    @AppStorage(MenuBarSettings.key) private var showMenuBar = true
    @AppStorage(DayPanel.sideKey) private var dayPanelSide = DayPanel.Side.right.rawValue
    /// Read from the system each time the pane opens (it can also change in
    /// System Settings › General › Login Items).
    @State private var openAtLogin = SMAppService.mainApp.status == .enabled
    @State private var loginItemNote: String?

    var body: some View {
        SettingsGroup(title: "Appearance") {
            SettingsRow(title: "Theme", detail: "Light or Dark for Plain Week only, or follow the system.") {
                MonoSegmented(options: Appearance.allCases, selection: Binding(
                    get: { Appearance(rawValue: appearance) ?? .system },
                    set: { appearance = $0.rawValue }
                ), label: \.label)
                .frame(width: 220)
            }
        }
        SettingsGroup(title: "Day panel",
                      footer: "One day in a narrow window, the height of the screen, beside the app you work in. It replaces the planner window while it shows.") {
            SettingsRow(title: "Show the day panel", detail: "Also in View › Show Day Panel (⇧⌘D).") {
                RowSwitch(isOn: Binding(get: { DayPanel.shared.isOpen }, set: { $0 ? DayPanel.shared.show() : DayPanel.shared.close() }))
            }
            SettingsRow(title: "Position", detail: "The screen edge it sits against.") {
                MonoSegmented(options: DayPanel.Side.allCases, selection: Binding(
                    get: { DayPanel.Side(rawValue: dayPanelSide) ?? .right },
                    set: { dayPanelSide = $0.rawValue; DayPanel.shared.place() }
                ), label: \.label)
                .frame(width: 160)
            }
        }
        SettingsGroup(title: "Everywhere", footer: loginItemNote) {
            SettingsRow(title: "Open at login", detail: "Start Plain Week when you log in to this Mac.") {
                RowSwitch(isOn: Binding(get: { openAtLogin }, set: setOpenAtLogin))
            }
            SettingsRow(title: "Show in the menu bar", detail: "Today's tasks, the running timer and a quick-add field.") {
                RowSwitch(isOn: $showMenuBar)
            }
            SettingsRow(title: "Quick add from any app", detail: "⌥Space opens a field that adds to today or the day you type.") {
                RowSwitch(isOn: $quickCapture)
            }
        }
        .onChange(of: quickCapture) { QuickCapture.shared.registerHotKey() }
    }

    /// Adds or removes Plain Week from the login items.
    private func setOpenAtLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            loginItemNote = SMAppService.mainApp.status == .requiresApproval
                ? "Allow Plain Week in System Settings › General › Login Items." : nil
        } catch {
            loginItemNote = "Could not change the login item: \(error.localizedDescription)"
        }
        openAtLogin = SMAppService.mainApp.status == .enabled || SMAppService.mainApp.status == .requiresApproval
    }
}

private struct PlannerPane: View {
    @AppStorage(PlannerModel.carryOverKey) private var carryOver = true
    @AppStorage(CalendarEvents.enabledKey) private var showEvents = false
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(CalendarEvents.self) private var calendar

    var body: some View {
        SettingsGroup(title: "Each day") {
            SettingsRow(title: "Move unfinished tasks to today",
                        detail: "Each morning, unfinished tasks from earlier days move to the end of today. Repeating tasks stay on their dates.") {
                RowSwitch(isOn: $carryOver)
            }
        }
        .onChange(of: carryOver) { _, on in
            if on { store.carryOverIfEnabled(today: planner.today, planner: planner) }
        }
        SettingsGroup(title: "Calendar",
                      footer: showEvents && !calendar.authorized
                          ? "Plain Week needs access to your calendars: allow it in System Settings › Privacy & Security › Calendars." : nil) {
            SettingsRow(title: "Show Calendar events in each day", detail: "Read-only, above the tasks: all-day first, then by time.") {
                RowSwitch(isOn: Binding(get: { showEvents }, set: { showEvents = $0; calendar.setEnabled($0) }))
            }
        }
    }
}

private struct TimerPane: View {
    @AppStorage(FocusTimer.modeKey) private var timerMode = FocusTimer.Mode.stopwatch.rawValue
    @AppStorage(FocusTimer.workMinutesKey) private var workMinutes = 25
    @AppStorage(FocusTimer.breakMinutesKey) private var breakMinutes = 5
    @AppStorage(FocusTimer.longBreakMinutesKey) private var longBreakMinutes = 15
    @AppStorage(FocusTimer.sessionsKey) private var sessionsPerCycle = 4
    @AppStorage(FocusTimer.autoStartKey) private var autoStart = true

    private var pomodoro: Bool { timerMode == FocusTimer.Mode.pomodoro.rawValue }

    var body: some View {
        SettingsGroup(footer: "Applies to the next timer you start. Focus time is saved per task and shown in the task and the weekly review.") {
            SettingsRow(title: "Mode", detail: pomodoro ? "Focus and break phases that switch on their own." : "Counts up while you work.") {
                MonoSegmented(options: FocusTimer.Mode.allCases, selection: Binding(
                    get: { FocusTimer.Mode(rawValue: timerMode) ?? .stopwatch },
                    set: { timerMode = $0.rawValue }
                ), label: \.label)
                .frame(width: 220)
            }
        }
        if pomodoro {
            SettingsGroup(title: "Pomodoro",
                          footer: "Each change sends a notification. To silence other apps meanwhile, add a Shortcuts automation that turns on a Focus.") {
                SettingsRow(title: "Focus", detail: "Minutes of work per session.") {
                    NumberStepper(value: $workMinutes, range: 5...120)
                }
                SettingsRow(title: "Break", detail: "Minutes between sessions.") {
                    NumberStepper(value: $breakMinutes, range: 1...60)
                }
                SettingsRow(title: "Long break", detail: "Minutes after the last session of a cycle.") {
                    NumberStepper(value: $longBreakMinutes, range: 5...60)
                }
                SettingsRow(title: "Sessions per cycle", detail: "Focus sessions before a long break.") {
                    NumberStepper(value: $sessionsPerCycle, range: 2...8)
                }
                SettingsRow(title: "Start the next phase automatically", detail: "Off: the timer waits for play at each change.") {
                    RowSwitch(isOn: $autoStart)
                }
            }
        }
    }
}

private struct NotificationsPane: View {
    @AppStorage(Reminders.leadKey) private var reminderLead = 5

    var body: some View {
        SettingsGroup(footer: "Notifications use the sound you chose in System Settings › Sound.") {
            SettingsRow(title: "Remind me of timed tasks", detail: "With Mark as Done and Snooze buttons, for the next week.") {
                Picker("", selection: $reminderLead) {
                    ForEach(Reminders.leadChoices, id: \.self) { minutes in
                        Text(minutes < 0 ? "Off" : minutes == 0 ? "At the time" : "\(minutes) min before").tag(minutes)
                    }
                }
                .labelsHidden()
            .modifier(RowLabel())
                .fixedSize()
            }
        }
        .onChange(of: reminderLead) { _, minutes in
            if minutes >= 0 { AppModel.shared.reminders.requestPermission() } else { AppModel.shared.reminders.reschedule() }
        }
    }
}

/// Sync: a folder in iCloud Drive shared by your Macs, and the Reminders and
/// Calendar mirrors that carry the week to iPhone and Watch.
private struct SyncPane: View {
    private let folder = AppModel.shared.folderSync
    private let mirror = AppModel.shared.remindersMirror
    private let publisher = AppModel.shared.calendarPublisher

    var body: some View {
        SettingsGroup(title: "Your Macs",
                      footer: "Pick a folder in iCloud Drive on each Mac. Every Mac keeps its own file there and takes in the others' changes; the latest edit wins.") {
            SettingsRow(title: "iCloud Drive folder", detail: folderStatus) {
                HStack(spacing: 8) {
                    if folder.isEnabled {
                        Button("Sync Now") { folder.syncNow() }.buttonStyle(PillButtonStyle())
                        Button("Stop") { folder.stop() }.buttonStyle(PillButtonStyle())
                    } else {
                        Button("Choose Folder…", action: chooseFolder).buttonStyle(PillButtonStyle())
                    }
                }
            }
        }
        SettingsGroup(title: "iPhone and Apple Watch", footer: accessNote) {
            SettingsRow(title: "Reminders list",
                        detail: "A Plain Week list kept in step both ways: tick or edit there, or add new tasks. Repeating tasks stay out.") {
                RowSwitch(isOn: Binding(get: { mirror.isEnabled }, set: { mirror.setEnabled($0) }))
            }
            SettingsRow(title: "Calendar", detail: "Tasks with a time as 30-minute events in a Plain Week calendar, for the month ahead. One-way.") {
                RowSwitch(isOn: Binding(get: { publisher.isEnabled }, set: { publisher.setEnabled($0) }))
            }
        }
    }

    private var folderStatus: String {
        guard let path = folder.folderPath else { return "Off" }
        let home = String(cString: getpwuid(getuid()).pointee.pw_dir)
        var shown = path.replacingOccurrences(of: home + "/Library/Mobile Documents/com~apple~CloudDocs", with: "iCloud Drive")
        shown = shown.replacingOccurrences(of: home, with: "~")
        guard let last = folder.lastSync else { return shown }
        return "\(shown) · synced \(last.formatted(date: .omitted, time: .shortened))"
    }

    private var accessNote: String? {
        if mirror.isEnabled && !mirror.authorized || publisher.isEnabled && !publisher.authorized {
            return "Plain Week needs full access: allow it in System Settings › Privacy & Security › Reminders or Calendars."
        }
        return "Both reach your iPhone and Apple Watch through iCloud."
    }

    private func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.prompt = "Sync Here"
        panel.message = "Choose a folder in iCloud Drive to share with your other Macs."
        let home = String(cString: getpwuid(getuid()).pointee.pw_dir)
        panel.directoryURL = URL(fileURLWithPath: home + "/Library/Mobile Documents/com~apple~CloudDocs")
        guard panel.runModal() == .OK, let url = panel.url else { return }
        try? folder.choose(url)
    }
}

/// Privacy: a password that locks Plain Week after some minutes without use,
/// with a secret question for a forgotten password.
private struct PrivacyPane: View {
    private enum Form { case none, setUp, password, question, turnOff }

    private let lock = AppModel.shared.lock
    @State private var form: Form = .none
    @State private var current = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var question = ""
    @State private var answer = ""
    @State private var message: String?

    var body: some View {
        if lock.isEnabled {
            SettingsGroup(title: "Lock",
                          footer: "Plain Week also locks when the Mac sleeps or its screen locks, and each time it opens. ⌃⌘L locks it at once.") {
                SettingsRow(title: "Lock after", detail: "Time without using Plain Week.") {
                    Picker("", selection: Binding(get: { lock.idleMinutes }, set: { lock.setIdleMinutes($0) })) {
                        ForEach(AppLock.idleChoices, id: \.self) { minutes in
                            Text(minutes == 1 ? "1 minute" : "\(minutes) minutes").tag(minutes)
                        }
                    }
                    .labelsHidden()
            .modifier(RowLabel())
                    .fixedSize()
                }
                SettingsRow(title: "Lock now", detail: "Hide your week until the password is entered.") {
                    Button("Lock") { lock.lock() }.buttonStyle(PillButtonStyle())
                }
            }
            SettingsGroup(title: "Password",
                          footer: "Forgot the password? Answer your secret question on the lock screen, then confirm with Touch ID or your Mac password.") {
                SettingsRow(title: "Password", detail: "Needed to unlock and to change these settings.") {
                    Button("Change…") { open(.password) }.buttonStyle(PillButtonStyle()).disabled(form != .none)
                }
                SettingsRow(title: "Secret question", detail: lock.question) {
                    Button("Change…") { open(.question) }.buttonStyle(PillButtonStyle()).disabled(form != .none)
                }
                SettingsRow(title: "Turn off the lock", detail: "Plain Week opens without a password.") {
                    Button("Turn Off…") { open(.turnOff) }.buttonStyle(PillButtonStyle()).disabled(form != .none)
                }
                if form != .none { fields }
            }
        } else {
            SettingsGroup(footer: "The tasks file on disk is not encrypted; the lock hides the app.") {
                SettingsRow(title: "Password lock",
                            detail: "Lock Plain Week after 5 minutes without use and whenever the Mac sleeps.") {
                    Button("Set Up…") { open(.setUp) }.buttonStyle(PillButtonStyle()).disabled(form != .none)
                }
                if form != .none { fields }
            }
        }
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: 8) {
            if form != .setUp {
                LockField(placeholder: "Current password", text: $current, secure: true, submit: save)
            }
            if form == .setUp || form == .password {
                LockField(placeholder: form == .setUp ? "Password" : "New password", text: $password, secure: true, submit: save)
                LockField(placeholder: "Confirm password", text: $confirm, secure: true, submit: save)
            }
            if form == .setUp || form == .question {
                LockField(placeholder: "Secret question, e.g. My first teacher's name?", text: $question, secure: false, submit: save)
                LockField(placeholder: "Answer", text: $answer, secure: false, submit: save)
            }
            HStack(spacing: 8) {
                if let message {
                    Text(message).font(.system(size: 12)).foregroundStyle(Theme.mutedForeground)
                }
                Spacer()
                Button("Cancel") { open(.none) }.buttonStyle(PillButtonStyle())
                Button(form == .turnOff ? "Turn Off" : form == .setUp ? "Turn On" : "Save", action: save)
                    .buttonStyle(MonoPrimaryButtonStyle())
            }
            .padding(.top, 4)
        }
        .padding(20)
        .overlay(alignment: .top) { Rectangle().fill(Theme.border).frame(height: 1) }
    }

    private func open(_ next: Form) {
        current = ""; password = ""; confirm = ""; answer = ""; message = nil
        question = next == .question ? lock.question : ""
        form = next
    }

    private func save() {
        let needsPassword = form == .setUp || form == .password
        let needsQuestion = form == .setUp || form == .question
        if needsPassword {
            guard password.count >= AppLock.minimumPasswordLength else { message = "Use at least \(AppLock.minimumPasswordLength) characters."; return }
            guard password == confirm else { message = "The passwords do not match."; return }
        }
        if needsQuestion {
            guard !question.trimmingCharacters(in: .whitespaces).isEmpty, !Secret.normalizeAnswer(answer).isEmpty else {
                message = "Add a question and its answer."; return
            }
        }
        let ok: Bool
        switch form {
        case .setUp:
            lock.setUp(password: password, question: question, answer: answer)
            ok = true
        case .password: ok = lock.changePassword(current: current, new: password)
        case .question: ok = lock.changeQuestion(password: current, question: question, answer: answer)
        case .turnOff: ok = lock.turnOff(password: current)
        case .none: ok = true
        }
        if ok { open(.none) } else { message = "Wrong current password."; current = "" }
    }
}

private struct DataPane: View {
    @AppStorage(Backups.enabledKey) private var dailyBackups = true
    @AppStorage(Cleanup.keepDaysKey) private var keepDoneDays = 0
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        SettingsGroup(title: "Move your week",
                      footer: "The same JSON format as the Plain Week web app, so your week moves both ways.") {
            SettingsRow(title: "Export tasks", detail: "Every task, done and repeating ones included, in one file.") {
                Button("Export…") { DataTransfer.export(store, planner: planner) }.buttonStyle(PillButtonStyle())
            }
            SettingsRow(title: "Import tasks", detail: "Adds the file's tasks next to the ones you have.") {
                Button("Import…") { DataTransfer.import(into: store, planner: planner) }.buttonStyle(PillButtonStyle())
            }
        }
        SettingsGroup(title: "Done tasks",
                      footer: "Repeating tasks keep their ticked days. Removed tasks go from every Mac you sync with.") {
            SettingsRow(title: "Keep done tasks", detail: "Older ones are removed each day, by the day they were planned for.") {
                Picker("", selection: $keepDoneDays) {
                    ForEach(Cleanup.choices, id: \.self) { Text(Cleanup.label($0)).tag($0) }
                }
                .labelsHidden()
            .modifier(RowLabel())
                .fixedSize()
            }
            SettingsRow(title: "Clean up now", detail: keepDoneDays == 0 ? "Choose how long to keep them first." : "Remove done tasks older than \(Cleanup.label(keepDoneDays)).") {
                Button("Clean Up") {
                    let count = Cleanup.run(store: store, today: planner.today, keepDays: keepDoneDays)
                    planner.show(count == 0 ? "Nothing to clean up." : "Removed \(count) done \(count == 1 ? "task" : "tasks").")
                }
                .buttonStyle(PillButtonStyle())
                .disabled(keepDoneDays == 0)
            }
        }
        SettingsGroup(title: "Paper") {
            SettingsRow(title: "The week as a PDF", detail: "A page with a box per day, for printing or sharing. Also File › Print Week… (⌘P).") {
                HStack(spacing: 8) {
                    Button("Export…") { WeekPrint.export(store: store, planner: planner) }.buttonStyle(PillButtonStyle())
                    Button("Print…") { WeekPrint.print(store: store, planner: planner) }.buttonStyle(PillButtonStyle())
                }
            }
        }
        SettingsGroup(title: "Backups") {
            SettingsRow(title: "Back up every day", detail: "Keeps the last 14, in Application Support › Plain Week › Backups.") {
                RowSwitch(isOn: $dailyBackups)
            }
            SettingsRow(title: "Backups", detail: "Make one now, or open the folder.") {
                HStack(spacing: 8) {
                    Button("Back Up Now") {
                        let url = Backups.runIfNeeded(store: store, today: planner.today, force: true)
                        planner.show(url == nil ? "There is nothing to back up yet." : "Backed up.")
                    }
                    .buttonStyle(PillButtonStyle())
                    Button("Show") { if let folder = Backups.folder() { NSWorkspace.shared.open(folder) } }
                        .buttonStyle(PillButtonStyle())
                }
            }
        }
    }
}
