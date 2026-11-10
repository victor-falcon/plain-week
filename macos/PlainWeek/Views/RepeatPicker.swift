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
        VStack(alignment: .leading, spacing: 16) {
            MonoSegmented(options: Kind.allCases, selection: $kind, label: \.rawValue)
                .background {
                    // ⌘0 Never, ⌘1 Daily, ⌘2 Weekly, ⌘3 Monthly; Return applies.
                    ForEach(Array(Kind.allCases.enumerated()), id: \.element) { index, value in
                        Button(value.rawValue) { withAnimation(Motion.standard) { kind = value } }
                            .keyboardShortcut(KeyEquivalent(Character("\(index)")), modifiers: [.command])
                    }
                    .opacity(0)
                    .allowsHitTesting(false)
                }

            Group {
                switch kind {
                case .never:
                    note(series != nil || item.task.recurrence != nil ? "Stops repeating." : "This task happens once.")
                case .daily:
                    row("Every") {
                        NumberStepper(value: $every, range: 1...RecurrenceEngine.maxEveryDays)
                        Text(every == 1 ? "day" : "days").foregroundStyle(Theme.mutedForeground)
                    }
                case .weekly:
                    VStack(alignment: .leading, spacing: 8) {
                        Text("On").font(.system(size: 13)).foregroundStyle(Theme.mutedForeground)
                        HStack(spacing: 6) {
                            ForEach(1...7, id: \.self) { weekday in
                                weekdayChip(weekday)
                            }
                        }
                    }
                case .monthly:
                    row("On day") {
                        NumberStepper(value: $day, range: 1...31)
                        Text("of each month").foregroundStyle(Theme.mutedForeground)
                    }
                }
            }
            .transition(.opacity)

            if kind != .never {
                VStack(alignment: .leading, spacing: 10) {
                    Toggle(isOn: $hasEnd.animation(Motion.standard)) {
                        Text("Ends").font(.system(size: 13, weight: .medium))
                    }
                    .toggleStyle(MonoSwitchStyle())
                    if hasEnd {
                        DatePicker("", selection: $until, in: DateKey.localDate(anchor)..., displayedComponents: .date)
                            .labelsHidden()
                            .datePickerStyle(.field)
                            .transition(.opacity)
                    }
                }
            }

            // What will happen, in plain words.
            if let summary {
                Text(summary)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(isValid ? Theme.foreground.opacity(0.8) : Color.primary.opacity(0.5))
                    .fixedSize(horizontal: false, vertical: true)
            }

            Rectangle().fill(Theme.border).frame(height: 1)

            HStack {
                Text("⌘0–3 type  ·  ↩ apply")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.mutedForeground)
                Spacer()
                Button("Apply") { onApply(draft) }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(MonoPrimaryButtonStyle())
                    .disabled(!isValid)
            }
        }
        .padding(18)
        .frame(width: 340)
        .focusEffectDisabled()
        .animation(Motion.standard, value: kind)
        .onAppear(perform: load)
    }

    private func row<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 10) {
            Text(label).font(.system(size: 13)).foregroundStyle(Theme.mutedForeground)
            content()
        }
        .font(.system(size: 13))
    }

    private func weekdayChip(_ weekday: Int) -> some View {
        let own = weekday == DateKey.isoWeekday(anchor)
        let on = weekdays.contains(weekday) || own
        return Button {
            guard !own else { return }
            if on { weekdays.remove(weekday) } else { weekdays.insert(weekday) }
        } label: {
            Text(Format.weekdayName(weekday).prefix(1))
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(on ? Theme.background : Theme.foreground)
                .frame(width: 34, height: 34)
                .background(Circle().fill(on ? Theme.foreground : Theme.hover))
                .overlay(Circle().strokeBorder(Theme.border, lineWidth: on ? 0 : 1))
                .contentShape(Circle())
        }
        .buttonStyle(.pressable)
        .help(own ? "\(Format.weekdayName(weekday, long: true)): the task's own day, always included"
                  : Format.weekdayName(weekday, long: true))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// The rule in words, with where it starts and ends.
    private var summary: String? {
        guard let rule = draft else { return nil }
        guard isValid else {
            return kind == .daily ? "Enter a number of days from 1 to 365." : "This rule never happens after the end date."
        }
        var text = RecurrenceEngine.summary(rule)
        if let start = firstDate { text += ", from \(Format.weekdayDate(start))" }
        if kind == .monthly, day >= 29 { text += ". Shorter months use their last day" }
        if isFirst, series != nil { text += ". Applies to the whole series" }
        return text + "."
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

/// A segmented control in black and white: a black pill slides to the choice.
struct MonoSegmented<Option: Hashable>: View {
    var options: [Option]
    @Binding var selection: Option
    var label: (Option) -> String
    @Namespace private var pill

    init(options: [Option], selection: Binding<Option>, label: @escaping (Option) -> String) {
        self.options = options
        _selection = selection
        self.label = label
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(options, id: \.self) { option in
                let selected = option == selection
                Button {
                    withAnimation(Motion.standard) { selection = option }
                } label: {
                    Text(label(option))
                        .font(.system(size: 13, weight: selected ? .semibold : .medium))
                        .foregroundStyle(selected ? Theme.background : Theme.foreground.opacity(0.75))
                        .frame(maxWidth: .infinity)
                        .frame(height: 30)
                        .background {
                            if selected {
                                Capsule().fill(Theme.foreground).matchedGeometryEffect(id: "pill", in: pill)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.pressable)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Capsule().fill(Theme.hover))
    }
}

/// − n + in one capsule; the number can also be typed.
struct NumberStepper: View {
    @Binding var value: Int
    var range: ClosedRange<Int>

    var body: some View {
        HStack(spacing: 0) {
            step("minus", -1)
            TextField("", value: $value, format: .number)
                .textFieldStyle(.plain)
                .multilineTextAlignment(.center)
                .font(.system(size: 13, weight: .semibold).monospacedDigit())
                .frame(width: 38)
            step("plus", 1)
        }
        .frame(height: 30)
        .background(Capsule().fill(Theme.hover))
        .overlay(Capsule().strokeBorder(Theme.border))
    }

    private func step(_ icon: String, _ delta: Int) -> some View {
        Button {
            value = min(max(value + delta, range.lowerBound), range.upperBound)
        } label: {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .bold))
                .frame(width: 28, height: 30)
                .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .foregroundStyle(Theme.foreground)
        .disabled(delta < 0 ? value <= range.lowerBound : value >= range.upperBound)
        .accessibilityLabel(delta < 0 ? "Decrease" : "Increase")
    }
}

/// A switch in black and white.
struct MonoSwitchStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack {
            configuration.label
            Spacer()
            Capsule()
                .fill(configuration.isOn ? Theme.foreground : Theme.border)
                .frame(width: 36, height: 22)
                .overlay(alignment: configuration.isOn ? .trailing : .leading) {
                    Circle().fill(Theme.background).padding(2).shadow(color: .black.opacity(0.15), radius: 1, y: 1)
                }
                .onTapGesture { configuration.isOn.toggle() }
                .animation(Motion.standard, value: configuration.isOn)
        }
        .contentShape(Rectangle())
        .accessibilityAddTraits(.isToggle)
    }
}

/// The main action of a popover or sheet: a black capsule (grey when disabled).
struct MonoPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(isEnabled ? Theme.background : Theme.mutedForeground)
            .padding(.horizontal, 18)
            .frame(height: 30)
            .background(Capsule().fill(isEnabled ? Theme.foreground : Theme.border))
            .opacity(configuration.isPressed ? 0.8 : 1)
            .contentShape(Capsule())
    }
}
