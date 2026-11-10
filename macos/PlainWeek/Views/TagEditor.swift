import SwiftUI

/// A task's tags under its title: "#tag" chips (× removes one) and a field
/// that adds a tag on Return, space or comma, suggesting tags already in use.
struct TagEditor: View {
    var tags: [String]
    var suggestions: [String]
    var save: ([String]) -> Void
    @State private var draft = ""
    @FocusState private var focused: Bool

    var body: some View {
        let typed = Tags.clean([draft]).first ?? ""
        let matches = suggestions.filter { !tags.contains($0) && (typed.isEmpty || $0.hasPrefix(typed)) && $0 != typed }.prefix(5)
        VStack(alignment: .leading, spacing: 6) {
            FlowLayout(spacing: 6) {
                Image(systemName: "number")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.mutedForeground)
                    .frame(height: 22)
                    .accessibilityHidden(true)
                ForEach(tags, id: \.self) { tag in
                    HStack(spacing: 3) {
                        Text(tag)
                        Button { save(tags.filter { $0 != tag }) } label: {
                            Image(systemName: "xmark").font(.system(size: 8, weight: .bold))
                        }
                        .buttonStyle(.pressable)
                        .help("Remove #\(tag)")
                        .accessibilityLabel("Remove tag \(tag)")
                    }
                    .font(.system(size: 12, weight: .medium))
                    .padding(.horizontal, 8)
                    .frame(height: 22)
                    .background(Capsule().fill(Theme.hover))
                }
                TextField("", text: $draft, prompt: Text(tags.isEmpty ? "Add tags" : "Add"))
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                    .frame(width: 90, height: 22)
                    .focused($focused)
                    .accessibilityLabel("Add a tag")
                    .onSubmit { add(draft) }
                    .onChange(of: draft) { _, value in
                        // Space or comma ends a tag.
                        if let last = value.last, last == " " || last == "," { add(value) }
                    }
            }
            if focused, !matches.isEmpty {
                HStack(spacing: 6) {
                    ForEach(Array(matches), id: \.self) { tag in
                        Button("#" + tag) { add(tag) }
                            .buttonStyle(.pressable)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Theme.mutedForeground)
                    }
                }
                .transition(.opacity)
            }
        }
        .animation(Motion.quick, value: tags)
    }

    private func add(_ text: String) {
        let new = Tags.clean([text])
        draft = ""
        guard let tag = new.first, !tags.contains(tag) else { return }
        save(tags + [tag])
    }
}

/// Lays children out in rows, wrapping to the next row when one is full.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let width = rows.map { $0.width }.max() ?? 0
        let height = rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: min(width, proposal.width ?? width), height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row { var indices: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = rows[rows.count - 1].indices.isEmpty ? size.width : rows[rows.count - 1].width + spacing + size.width
            if needed > width, !rows[rows.count - 1].indices.isEmpty {
                rows.append(Row())
            }
            var row = rows[rows.count - 1]
            row.width = row.indices.isEmpty ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
            row.indices.append(index)
            rows[rows.count - 1] = row
        }
        return rows
    }
}
