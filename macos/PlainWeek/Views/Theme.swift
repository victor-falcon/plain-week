import AppKit
import SwiftUI

/// The web app's design tokens (resources/css/app.css), converted from OKLCH,
/// light and dark. Views use these, never raw colors.
enum Theme {
    /// OKLCH → sRGB (Björn Ottosson's matrices), clamped.
    static func oklch(_ l: Double, _ c: Double, _ h: Double, alpha: Double = 1) -> NSColor {
        let hr = h * .pi / 180
        let a = c * cos(hr), b = c * sin(hr)
        let l_ = l + 0.3963377774 * a + 0.2158037573 * b
        let m_ = l - 0.1055613458 * a - 0.0638541728 * b
        let s_ = l - 0.0894841775 * a - 1.2914855480 * b
        let L = l_ * l_ * l_, M = m_ * m_ * m_, S = s_ * s_ * s_
        let r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S
        let g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S
        let bl = -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S
        func gamma(_ x: Double) -> CGFloat {
            let v = x <= 0.0031308 ? 12.92 * x : 1.055 * pow(x, 1 / 2.4) - 0.055
            return CGFloat(min(max(v, 0), 1))
        }
        return NSColor(srgbRed: gamma(r), green: gamma(g), blue: gamma(bl), alpha: alpha)
    }

    static func dynamic(light: NSColor, dark: NSColor) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
        })
    }

    static let background = dynamic(light: oklch(1, 0, 0), dark: oklch(0.147, 0.004, 49.25))
    static let foreground = dynamic(light: oklch(0.147, 0.004, 49.25), dark: oklch(0.985, 0.001, 106.423))
    static let secondary = dynamic(light: oklch(0.967, 0.001, 286.375), dark: oklch(0.274, 0.006, 286.033))
    static let muted = dynamic(light: oklch(0.97, 0.001, 106.424), dark: oklch(0.268, 0.007, 34.298))
    static let mutedForeground = dynamic(light: oklch(0.553, 0.013, 58.071), dark: oklch(0.709, 0.01, 56.259))
    static let border = dynamic(light: oklch(0.923, 0.003, 48.717), dark: oklch(1, 0, 0, alpha: 0.1))
    static let primary = dynamic(light: oklch(0.488, 0.243, 264.376), dark: oklch(0.424, 0.199, 265.638))
    static let plannerAccent = dynamic(light: oklch(0.488, 0.243, 264.376), dark: oklch(0.75, 0.14, 264.4))
    static let plannerAccentMuted = dynamic(light: oklch(0.54, 0.2, 264.4), dark: oklch(0.62, 0.14, 264.4))
    static let todayTint = dynamic(light: oklch(0.488, 0.243, 264.376, alpha: 0.06), dark: oklch(0.75, 0.14, 264.4, alpha: 0.10))

    /// Day cards and Someday: a warm off-white (stone 50) / raised dark surface.
    static let card = dynamic(light: oklch(0.985, 0.001, 106.423), dark: oklch(0.205, 0.004, 49.25))
    /// Row hover and pressed states.
    static let hover = dynamic(light: oklch(0.147, 0.004, 49.25, alpha: 0.05), dark: oklch(1, 0, 0, alpha: 0.07))

    /// Task rows; tighter than the web's 42px, since rows have no rules.
    static let rowHeight: CGFloat = 34
    static let cardRadius: CGFloat = 18
    static let sidebarWidth: CGFloat = 300
    static let rowRadius: CGFloat = 8

    /// The big header type.
    static let display = Font.system(size: 48, weight: .bold)

    private static let darkText = oklch(0.147, 0.004, 49.25)
    private static let lightText = oklch(0.985, 0.001, 106.423)

    /// Pill background and text per task color (docs/style.md, "Task colors").
    static func pill(_ color: TaskColor) -> (background: Color, text: Color)? {
        func pair(_ lightBg: NSColor, _ lightFg: NSColor, _ darkBg: NSColor, _ darkFg: NSColor) -> (Color, Color) {
            (dynamic(light: lightBg, dark: darkBg), dynamic(light: lightFg, dark: darkFg))
        }
        switch color {
        case .none: return nil
        case .pink: return pair(oklch(0.552, 0.196, 8.6), lightText, oklch(0.6, 0.2, 8.6), lightText)
        case .yellow: return pair(oklch(0.938, 0.162, 104.6), darkText, oklch(0.9, 0.155, 104.6), darkText)
        case .black: return pair(darkText, lightText, lightText, darkText)
        case .grey: return pair(oklch(0.83, 0.004, 56.4), darkText, oklch(0.444, 0.011, 73.639), lightText)
        case .cornflower: return pair(oklch(0.577, 0.21, 270.1), lightText, oklch(0.62, 0.19, 270.1), lightText)
        case .mango: return pair(oklch(0.813, 0.164, 74.6), darkText, oklch(0.8, 0.16, 74.6), darkText)
        case .green: return pair(oklch(0.888, 0.193, 160.4), darkText, oklch(0.85, 0.18, 160.4), darkText)
        case .lilac: return pair(oklch(0.705, 0.235, 316.3), darkText, oklch(0.72, 0.21, 316.3), darkText)
        }
    }

    /// The checkbox ring (and its fill when done) per task color, with the
    /// check drawn on top. The pill colors meant for backgrounds (yellow,
    /// green, mango, grey, lilac) are too light for a thin ring on a white card,
    /// so light mode uses darker shades of the same hues; dark mode keeps the
    /// bright pill colors (grey a little lighter), which already stand out.
    static func checkbox(_ color: TaskColor) -> (ring: Color, check: Color)? {
        func pair(_ light: NSColor, _ dark: NSColor, darkCheck: NSColor = darkText) -> (Color, Color) {
            (dynamic(light: light, dark: dark), dynamic(light: lightText, dark: darkCheck))
        }
        switch color {
        case .none: return nil
        case .pink: return pair(oklch(0.552, 0.196, 8.6), oklch(0.6, 0.2, 8.6), darkCheck: lightText)
        case .yellow: return pair(oklch(0.72, 0.15, 98), oklch(0.9, 0.155, 104.6))
        case .black: return pair(darkText, lightText)
        case .grey: return pair(oklch(0.6, 0.008, 56.4), oklch(0.62, 0.011, 73.6), darkCheck: lightText)
        case .cornflower: return pair(oklch(0.577, 0.21, 270.1), oklch(0.62, 0.19, 270.1), darkCheck: lightText)
        case .mango: return pair(oklch(0.7, 0.16, 62), oklch(0.8, 0.16, 74.6))
        case .green: return pair(oklch(0.66, 0.16, 158), oklch(0.85, 0.18, 160.4))
        case .lilac: return pair(oklch(0.6, 0.23, 316.3), oklch(0.72, 0.21, 316.3))
        }
    }
}

/// A round color swatch for pickers.
struct ColorSwatch: View {
    var color: TaskColor
    var selected = false
    var size: CGFloat = 20

    var body: some View {
        ZStack {
            if let pill = Theme.pill(color) {
                Circle().fill(pill.background)
            } else {
                Circle().strokeBorder(Theme.foreground.opacity(0.4), lineWidth: 1)
            }
            if selected {
                Image(systemName: "checkmark")
                    .font(.system(size: size * 0.5, weight: .bold))
                    .foregroundStyle(Theme.pill(color)?.text ?? Theme.foreground)
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel(color.label)
    }
}
