import SwiftUI

/// The repeat popover: Never / Daily / Weekly / Monthly, the rule's details
/// and an end date. It holds a draft that "Apply" writes (docs/style.md,
/// "Recurring tasks").
struct RepeatPicker: View {
    var item: PlannerItem
    var series: PlainTask?
    var isFirst: Bool
    var onApply: (Recurrence?) -> Void

    private enum Kind: String, CaseIterable, Identifiable {
        case never = "Never", daily = "Daily", weekly = "Weekly", monthly = "Monthly"
        var id: String { rawValue }
    }

    @State private var kind = Kind.never
    @State private var every = 2
    @State private var weekdays: Set<Int> = []
    @State private var day = 1
    @State private var hasEnd = false
    @State private var until = Date()

    /// The date the rule starts from (an occurrence's own date).
    private var anchor: String { item.occurrenceDate ?? item.task.date ?? DateKey.local() }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Picker("Repeat", selection: $kind) {
                ForEach(Kind.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .background {
                // ⌘0 Never, ⌘1 Daily, ⌘2 Weekly, ⌘3 Monthly; Return applies.
                ForEach(Array(Kind.allCases.enumerated()), id: \.element) { index, value in
                    Button(value.rawValue) { kind = value }
                        .keyboardShortcut(KeyEquivalent(Character("\(index)")), modifiers: [.command])
                }
                .opacity(0)
                .allowsHitTesting(false)
            }
            Text("⌘0 never  ·  ⌘1 daily  ·  ⌘2 weekly  ·  ⌘3 monthly  ·  ↩ apply")
                .font(.system(size: 11))
                .foregroundStyle(Theme.mutedForeground)

            switch kind {
            case .never:
                EmptyView()
            case .daily:
                HStack {
                    Text("Every")
                    TextField("", value: $every, format: .number)
                        .frame(width: 50)
                        .multilineTextAlignment(.trailing)
                    Stepper("", value: $every, in: 1...RecurrenceEngine.maxEveryDays).labelsHidden()
                    Text(every == 1 ? "day" : "days")
                }
                if !(1...RecurrenceEngine.maxEveryDays).contains(every) {
                    note("Enter a number of days from 1 to 365.")
                }
            case .weekly:
                HStack(spacing: 4) {
                    ForEach(1...7, id: \.self) { weekday in
                        let own = weekday == DateKey.isoWeekday(anchor)
                        Toggle(Format.weekdayName(weekday).prefix(2), isOn: Binding(
                            get: { weekdays.contains(weekday) || own },
                            set: { on in if on { weekdays.insert(weekday) } else if !own { weekdays.remove(weekday) } }
                        ))
                        .toggleStyle(.button)
                        .help(Format.weekdayName(weekday, long: true))
                    }
                }
            case .monthly:
                Picker("Monthly on day", selection: $day) {
                    ForEach(1...31, id: \.self) { Text("\($0)").tag($0) }
                }
                .frame(width: 200)
                if day >= 29 { note("On the last day in shorter months.") }
                if day != DateKey.dayOfMonth(anchor), let start = firstDate {
                    note("Starts on \(Format.fullDate(start)).")
                }
            }

            if kind != .never {
                HStack {
                    Toggle("Ends", isOn: $hasEnd)
                    if hasEnd {
                        DatePicker("", selection: $until, in: DateKey.localDate(anchor)..., displayedComponents: .date)
                            .labelsHidden()
                    }
                }
            }

            if isFirst, series != nil {
                note(kind == .never ? "Stops the whole series." : "Applies to the whole series.")
            }

            HStack {
                Spacer()
                Button("Apply") { onApply(draft) }
                    .keyboardShortcut(.defaultAction)
                    .disabled(!isValid)
            }
        }
        .padding(16)
        .frame(width: 340)
        .onAppear(perform: load)
    }

    private func note(_ text: String) -> some View {
        Text(text).font(.callout).foregroundStyle(Theme.mutedForeground)
    }

    private var draft: Recurrence? {
        let end = hasEnd ? DateKey.local(until) : nil
        switch kind {
        case .never: return nil
        case .daily: return .daily(every: every, until: end)
        case .weekly: return .weekly(Array(weekdays.union([DateKey.isoWeekday(anchor)])).sorted(), until: end)
        case .monthly: return .monthly(day: day, until: end)
        }
    }

    private var firstDate: String? {
        guard let rule = draft else { return nil }
        var probe = item.task
        probe.date = anchor
        probe.recurrence = rule
        return RecurrenceEngine.firstOccurrence(of: probe)
    }

    private var isValid: Bool {
        guard let rule = draft else { return series != nil || item.task.recurrence != nil }
        guard (try? RecurrenceEngine.normalize(rule, anchor: anchor)) != nil else { return false }
        return firstDate != nil
    }

    private func load() {
        day = DateKey.dayOfMonth(anchor)
        weekdays = [DateKey.isoWeekday(anchor)]
        guard let rule = series?.recurrence ?? item.task.recurrence else { return }
        switch rule.type {
        case .daily: kind = .daily; every = rule.every ?? 2
        case .weekly: kind = .weekly; weekdays = Set(rule.weekdays ?? [])
        case .monthly: kind = .monthly; day = rule.day ?? day
        }
        if let end = rule.until { hasEnd = true; until = DateKey.localDate(end) }
    }
}
