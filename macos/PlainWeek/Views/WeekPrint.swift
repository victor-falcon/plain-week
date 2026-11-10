import AppKit
import PDFKit
import SwiftUI
import UniformTypeIdentifiers

/// The week on paper: an A4 landscape page with a box per day (tasks with
/// their time, length and a tick), black on white. File › Export Week as PDF…
/// saves it; File › Print Week… (⌘P) prints it.
@MainActor
enum WeekPrint {
    static let pageSize = CGSize(width: 842, height: 595)

    /// The Monday of the week the planner shows.
    static func shownWeek(_ planner: PlannerModel) -> String {
        DateKey.startOfWeek(DateKey.addDays(planner.weekStart, 3))
    }

    static func pdf(store: TaskStore, monday: String) -> Data? {
        let renderer = ImageRenderer(content: PrintableWeek(store: store, monday: monday)
            .frame(width: pageSize.width, height: pageSize.height)
            .environment(\.colorScheme, .light))
        let data = NSMutableData()
        var box = CGRect(origin: .zero, size: pageSize)
        guard let consumer = CGDataConsumer(data: data as CFMutableData),
              let context = CGContext(consumer: consumer, mediaBox: &box, nil) else { return nil }
        renderer.render { _, draw in
            context.beginPDFPage(nil)
            draw(context)
            context.endPDFPage()
        }
        context.closePDF()
        return data as Data
    }

    static func export(store: TaskStore, planner: PlannerModel) {
        let monday = shownWeek(planner)
        guard let data = pdf(store: store, monday: monday) else { planner.show("Could not make the PDF."); return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.pdf]
        panel.nameFieldStringValue = "plain-week-\(monday).pdf"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try data.write(to: url, options: .atomic)
            planner.show("Saved the week as a PDF.")
        } catch {
            planner.show("Could not save the PDF.")
        }
    }

    static func print(store: TaskStore, planner: PlannerModel) {
        guard let data = pdf(store: store, monday: shownWeek(planner)), let document = PDFDocument(data: data) else { return }
        let info = NSPrintInfo.shared.copy() as! NSPrintInfo
        info.orientation = .landscape
        guard let operation = document.printOperation(for: info, scalingMode: .pageScaleToFit, autoRotate: true) else { return }
        operation.showsPrintPanel = true
        operation.run()
    }
}

/// The printed page.
struct PrintableWeek: View {
    let store: TaskStore
    let monday: String

    var body: some View {
        let sunday = DateKey.addDays(monday, 6)
        let days = store.days(from: monday, to: sunday)
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(Format.monthYear(DateKey.addDays(monday, 3))).font(.system(size: 22, weight: .bold))
                Text("Week \(DateKey.isoWeekNumber(monday))").font(.system(size: 13)).foregroundStyle(.gray)
                Spacer()
                Text("Plain Week").font(.system(size: 10)).foregroundStyle(.gray)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10, alignment: .top), count: 4), spacing: 10) {
                ForEach(0..<7, id: \.self) { offset in
                    let day = DateKey.addDays(monday, offset)
                    dayBox(day, items: days[day] ?? [])
                }
                notesBox
            }
        }
        .padding(28)
        .foregroundStyle(.black)
        .background(.white)
    }

    private func dayBox(_ day: String, items: [PlannerItem]) -> some View {
        let shown = items.prefix(11)
        return VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(DateKey.dayOfMonth(day))").font(.system(size: 18, weight: .bold))
                Text(Format.weekday(day).uppercased()).font(.system(size: 9, weight: .semibold)).tracking(0.6).foregroundStyle(.gray)
                Spacer()
                let planned = store.plannedMinutes(on: day)
                if planned > 0 { Text(TaskTiming.short(planned)).font(.system(size: 9)).foregroundStyle(.gray) }
            }
            .padding(.bottom, 2)
            ForEach(Array(shown)) { item in
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Image(systemName: item.task.done ? "checkmark.square" : "square").font(.system(size: 9))
                    Text(item.task.text)
                        .font(.system(size: 10))
                        .strikethrough(item.task.done)
                        .foregroundStyle(item.task.done ? .gray : .black)
                        .lineLimit(1)
                    Spacer(minLength: 2)
                    if let time = item.task.time {
                        Text(item.task.duration.map { "\(time) · \(TaskTiming.short($0))" } ?? time)
                            .font(.system(size: 9).monospacedDigit()).foregroundStyle(.gray)
                    }
                }
                Rectangle().fill(Color.gray.opacity(0.25)).frame(height: 0.5)
            }
            if items.count > shown.count {
                Text("+\(items.count - shown.count) more").font(.system(size: 9)).foregroundStyle(.gray)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(height: 245, alignment: .top)
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.gray.opacity(0.4), lineWidth: 0.75))
    }

    /// The eighth box: room to write.
    private var notesBox: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("NOTES").font(.system(size: 9, weight: .semibold)).tracking(0.6).foregroundStyle(.gray)
            ForEach(0..<9, id: \.self) { _ in Rectangle().fill(Color.gray.opacity(0.25)).frame(height: 0.5) }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(height: 245, alignment: .top)
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.gray.opacity(0.4), lineWidth: 0.75))
    }
}
