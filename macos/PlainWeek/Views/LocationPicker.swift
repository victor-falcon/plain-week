import AppKit
import MapKit
import Observation
import SwiftUI

/// A task's place: opening it in Apple Maps.
enum Place {
    /// Apple Maps searching for the place.
    static func mapsURL(_ place: String) -> URL? {
        var parts = URLComponents(string: "https://maps.apple.com/")
        parts?.queryItems = [URLQueryItem(name: "q", value: place)]
        return parts?.url
    }

    /// Apple Maps with directions there from where you are.
    static func directionsURL(_ place: String) -> URL? {
        var parts = URLComponents(string: "https://maps.apple.com/")
        parts?.queryItems = [URLQueryItem(name: "daddr", value: place)]
        return parts?.url
    }

    static func open(_ place: String, directions: Bool = false) {
        if let url = directions ? directionsURL(place) : mapsURL(place) { NSWorkspace.shared.open(url) }
    }

    /// One line for a row's tooltip or a chip.
    static func short(_ place: String, max: Int = 28) -> String {
        place.count > max ? String(place.prefix(max - 1)) + "…" : place
    }
}

/// Address and place suggestions from Apple Maps as you type. Offline it
/// simply has none; whatever was typed is kept as the place.
@MainActor
@Observable
final class LocationSearch: NSObject, MKLocalSearchCompleterDelegate {
    struct Suggestion: Identifiable, Hashable {
        var title: String
        var subtitle: String
        var id: String { title + "\n" + subtitle }
        /// What a task stores: name and address on one line.
        var place: String { subtitle.isEmpty ? title : "\(title), \(subtitle)" }
    }

    private(set) var suggestions: [Suggestion] = []
    @ObservationIgnored private let completer = MKLocalSearchCompleter()

    override init() {
        super.init()
        completer.delegate = self
        completer.resultTypes = [.address, .pointOfInterest]
    }

    func search(_ text: String) {
        let query = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 3 else {
            suggestions = []
            completer.cancel()
            return
        }
        completer.queryFragment = query
    }

    nonisolated func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        let found = completer.results.prefix(6).map { Suggestion(title: $0.title, subtitle: $0.subtitle) }
        Task { @MainActor in self.suggestions = Array(found) }
    }

    nonisolated func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
        Task { @MainActor in self.suggestions = [] }
    }
}

/// The task sheet's place popover: type an address or a place's name, pick
/// a suggestion from Maps (or press Return to keep what you typed), open it
/// in Maps, or clear it.
struct LocationPicker: View {
    var current: String?
    var save: (String?) -> Void
    @State private var text = ""
    @State private var search = LocationSearch()
    @State private var highlighted: Int?
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("", text: $text, prompt: Text("Address or place"))
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .accessibilityLabel("Location")
                .focused($focused)
                .padding(.horizontal, 10)
                .frame(height: 30)
                .background(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).fill(Theme.hover))
                .onSubmit(commit)
                .onKeyPress(.downArrow) { move(1); return .handled }
                .onKeyPress(.upArrow) { move(-1); return .handled }
                .onChange(of: text) { _, value in
                    highlighted = nil
                    search.search(value)
                }

            if !search.suggestions.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(search.suggestions.enumerated()), id: \.element.id) { index, suggestion in
                        Button { save(suggestion.place) } label: {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Image(systemName: "mappin")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(Theme.mutedForeground)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(suggestion.title).font(.system(size: 13)).lineLimit(1)
                                    if !suggestion.subtitle.isEmpty {
                                        Text(suggestion.subtitle)
                                            .font(.system(size: 11))
                                            .foregroundStyle(Theme.mutedForeground)
                                            .lineLimit(1)
                                    }
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .fill(highlighted == index ? Theme.hover : .clear))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .onHover { if $0 { highlighted = index } }
                    }
                }
                .transition(.opacity)
            }

            HStack(spacing: 8) {
                if let current {
                    Button("Open in Maps") { Place.open(current) }.buttonStyle(PillButtonStyle())
                    Button("Directions") { Place.open(current, directions: true) }.buttonStyle(PillButtonStyle())
                }
                Spacer()
                Button("Clear") { save(nil) }
                    .buttonStyle(PillButtonStyle())
                    .disabled(current == nil)
            }
        }
        .padding(12)
        .frame(width: 340)
        .animation(Motion.quick, value: search.suggestions)
        .onAppear {
            text = current ?? ""
            focused = true
        }
    }

    private func move(_ step: Int) {
        let count = search.suggestions.count
        guard count > 0 else { return }
        highlighted = ((highlighted ?? (step > 0 ? -1 : count)) + step + count) % count
    }

    private func commit() {
        if let highlighted, search.suggestions.indices.contains(highlighted) {
            save(search.suggestions[highlighted].place)
            return
        }
        let typed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        save(typed.isEmpty ? nil : typed)
    }
}
