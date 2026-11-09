import SwiftUI

/// Settings: appearance, carry over and data (export / import), built from
/// the same black-and-white parts as the planner.
struct SettingsView: View {
    @AppStorage("appearance") private var appearance = Appearance.system.rawValue
    @AppStorage(PlannerModel.carryOverKey) private var carryOver = true
    @AppStorage(FocusTimer.modeKey) private var timerMode = FocusTimer.Mode.stopwatch.rawValue
    @AppStorage(FocusTimer.workMinutesKey) private var workMinutes = 25
    @AppStorage(FocusTimer.breakMinutesKey) private var breakMinutes = 5
    @AppStorage(Reminders.leadKey) private var reminderLead = 5
    @AppStorage(QuickCapture.enabledKey) private var quickCapture = true
    @AppStorage(MenuBarSettings.key) private var showMenuBar = true
    @AppStorage(CalendarEvents.enabledKey) private var showEvents = false
    @AppStorage(Backups.enabledKey) private var dailyBackups = true
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(CalendarEvents.self) private var calendar

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            section("Appearance") {
                MonoSegmented(options: Appearance.allCases, selection: Binding(
                    get: { Appearance(rawValue: appearance) ?? .system },
                    set: { appearance = $0.rawValue }
                ), label: \.label)
                note("Light or Dark for Plain Week only, or follow the system.")
            }

            section("Planner") {
                Toggle(isOn: $carryOver) {
                    Text("Move unfinished tasks to today").font(.system(size: 14, weight: .medium))
                }
                .toggleStyle(MonoSwitchStyle())
                .onChange(of: carryOver) { _, on in
                    if on { store.carryOverIfEnabled(today: planner.today, planner: planner) }
                }
                note("Each morning, unfinished tasks from earlier days move to the end of today, like a paper planner rewritten each day. Repeating tasks stay on their dates.")
            }

            section("Timer") {
                MonoSegmented(options: FocusTimer.Mode.allCases, selection: Binding(
                    get: { FocusTimer.Mode(rawValue: timerMode) ?? .stopwatch },
                    set: { timerMode = $0.rawValue }
                ), label: \.label)
                if timerMode == FocusTimer.Mode.pomodoro.rawValue {
                    HStack(spacing: 16) {
                        HStack(spacing: 8) {
                            Text("Focus").foregroundStyle(Theme.mutedForeground)
                            NumberStepper(value: $workMinutes, range: 5...120)
                        }
                        HStack(spacing: 8) {
                            Text("Break").foregroundStyle(Theme.mutedForeground)
                            NumberStepper(value: $breakMinutes, range: 1...60)
                        }
                        Text("minutes").foregroundStyle(Theme.mutedForeground)
                    }
                    .font(.system(size: 13))
                }
                note(timerMode == FocusTimer.Mode.pomodoro.rawValue
                     ? "Focus and break phases switch on their own, with a notification. Applies to the next timer you start. To silence other apps meanwhile, add a Shortcuts automation that turns on a Focus."
                     : "The timer counts up. Focus time is saved per task and shown in the task and the weekly review.")
            }

            section("Reminders") {
                HStack {
                    Text("Remind me of timed tasks").font(.system(size: 14, weight: .medium))
                    Spacer()
                    Picker("", selection: $reminderLead) {
                        ForEach(Reminders.leadChoices, id: \.self) { minutes in
                            Text(minutes < 0 ? "Off" : minutes == 0 ? "At the time" : "\(minutes) min before").tag(minutes)
                        }
                    }
                    .labelsHidden()
                    .fixedSize()
                }
                .onChange(of: reminderLead) { _, minutes in
                    if minutes >= 0 { AppModel.shared.reminders.requestPermission() } else { AppModel.shared.reminders.reschedule() }
                }
                note("A notification with Mark as Done and Snooze buttons, for tasks with a time in the next week.")
            }

            section("Everywhere") {
                Toggle(isOn: $quickCapture) {
                    Text("Quick add with ⌥Space from any app").font(.system(size: 14, weight: .medium))
                }
                .toggleStyle(MonoSwitchStyle())
                .onChange(of: quickCapture) { QuickCapture.shared.registerHotKey() }
                Toggle(isOn: $showMenuBar) {
                    Text("Show in the menu bar").font(.system(size: 14, weight: .medium))
                }
                .toggleStyle(MonoSwitchStyle())
                Toggle(isOn: Binding(get: { showEvents }, set: { showEvents = $0; calendar.setEnabled($0) })) {
                    Text("Show Calendar events in each day").font(.system(size: 14, weight: .medium))
                }
                .toggleStyle(MonoSwitchStyle())
                note(showEvents && !calendar.authorized
                     ? "Plain Week needs access to your calendars: allow it in System Settings › Privacy & Security › Calendars."
                     : "Events are read-only and stay on this Mac. Siri and the Shortcuts app can add tasks, list today and start the timer.")
            }

            section("Data") {
                HStack(spacing: 8) {
                    Button("Export Tasks…") { DataTransfer.export(store, planner: planner) }
                        .buttonStyle(PillButtonStyle())
                    Button("Import Tasks…") { DataTransfer.import(into: store, planner: planner) }
                        .buttonStyle(PillButtonStyle())
                }
                note("Backups use the same JSON format as the Plain Week web app, so you can move your week between them. Importing adds tasks next to the ones you have.")
                Toggle(isOn: $dailyBackups) {
                    Text("Back up every day (keeps 14)").font(.system(size: 14, weight: .medium))
                }
                .toggleStyle(MonoSwitchStyle())
                HStack(spacing: 8) {
                    Button("Back Up Now") {
                        let url = Backups.runIfNeeded(store: store, today: planner.today, force: true)
                        planner.show(url == nil ? "There is nothing to back up yet." : "Backed up.")
                    }
                    .buttonStyle(PillButtonStyle())
                    Button("Show Backups") { if let folder = Backups.folder() { NSWorkspace.shared.open(folder) } }
                        .buttonStyle(PillButtonStyle())
                }
            }
        }
        .padding(28)
        .frame(width: 520, alignment: .leading)
        .background(Theme.background)
        .focusEffectDisabled()
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.8)
                .foregroundStyle(Theme.mutedForeground)
            content()
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12))
            .foregroundStyle(Theme.mutedForeground)
            .fixedSize(horizontal: false, vertical: true)
    }
}
