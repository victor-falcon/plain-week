import AppKit
import SwiftUI

/// The app's design tokens, light and dark. Surfaces, text and borders are a
/// warm neutral palette (white page over an off-white sidebar; #191919 page
/// over a #202020 sidebar in dark). Task colors are the web app's tokens
/// (resources/css/app.css), converted from OKLCH. Views use these, never raw colors.
enum Theme {
    /// An sRGB color from 0xRRGGBB.
    static func hex(_ value: UInt32, alpha: Double = 1) -> NSColor {
        NSColor(srgbRed: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255,
                blue: CGFloat(value & 0xFF) / 255, alpha: alpha)
    }

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

    /// `lightContrast` / `darkContrast` replace the colors while Increase
    /// Contrast is on (System Settings › Accessibility › Display).
    static func dynamic(light: NSColor, dark: NSColor, lightContrast: NSColor? = nil, darkContrast: NSColor? = nil) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            // The app's own Light / Dark setting fixes the appearance, which
            // drops the system's high-contrast variant: ask the system too.
            let highContrast = NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast
            if highContrast, let stronger = isDark ? darkContrast : lightContrast { return stronger }
            return isDark ? dark : light
        })
    }

    /// The page: white, or #191919 in dark.
    static let background = dynamic(light: hex(0xFFFFFF), dark: hex(0x191919))
    /// The sidebar, one step off the page: warm off-white, or #202020 in dark.
    static let sidebar = dynamic(light: hex(0xF9F8F7), dark: hex(0x202020))
    static let foreground = dynamic(light: hex(0x2C2C2B), dark: hex(0xF0EFED))
    static let secondary = dynamic(light: hex(0xF1F1EF), dark: hex(0x2A2A2A))
    static let muted = dynamic(light: hex(0xF6F5F4), dark: hex(0x252525))
    /// Grey text and hairlines get stronger with Increase Contrast.
    static let mutedForeground = dynamic(light: hex(0x73726E), dark: hex(0x9B9B9B),
                                         lightContrast: hex(0x4A4946), darkContrast: hex(0xC8C8C8))
    static let border = dynamic(light: hex(0xEEEEEC), dark: hex(0xFFFFFF, alpha: 0.094),
                                lightContrast: hex(0x9E9D99), darkContrast: hex(0xFFFFFF, alpha: 0.4))
    /// Errors and warnings.
    static let danger = dynamic(light: hex(0xC4302B), dark: hex(0xFF6B63),
                                lightContrast: hex(0x9C1B17), darkContrast: hex(0xFF8A84))
    static let primary = dynamic(light: oklch(0.488, 0.243, 264.376), dark: oklch(0.424, 0.199, 265.638))
    /// The interface is monochrome, like Calendar on the Mac: black, white
    /// and greys. Task colors are the only color, so the accent (today, the
    /// selected day, done checks, the drop line) is the text color itself.
    static let plannerAccent = foreground
    static let plannerAccentMuted = mutedForeground
    /// Today's card: white like the weekdays, marked by its black day number.
    static let todayTint = background

    /// Day cards and Someday: the sidebar's warm off-white / raised dark surface.
    static let card = sidebar
    /// Day cards: weekdays white (the page), weekends a light grey, as in Calendar.
    static let weekdayCard = background
    static let weekendCard = dynamic(light: hex(0xF6F5F4), dark: hex(0x1E1E1E))
    /// The border of the selected day card: #F0F0F0 in light mode, #424242 in dark.
    static let selectedDayBorder = dynamic(light: hex(0xF0F0F0), dark: hex(0x424242))
    /// Row hover, and (stronger) a row under a pressed mouse button.
    static let hover = dynamic(light: hex(0x37352F, alpha: 0.06), dark: hex(0xFFFFFF, alpha: 0.055))
    static let pressed = dynamic(light: hex(0x37352F, alpha: 0.12), dark: hex(0xFFFFFF, alpha: 0.11))

    /// Task rows (and empty rows), 50pt; a title that wraps grows its row.
    static let rowHeight: CGFloat = 50
    static let sidebarWidth: CGFloat = 250

    // MARK: Radii (concentric: an inner radius is the outer one minus its inset)

    static let cardRadius: CGFloat = 18
    /// Day cards inset their rows by 8pt, so rows round at 18 − 8.
    static let rowRadius: CGFloat = 10
    /// Fields and small controls.
    static let controlRadius: CGFloat = 10
    /// Floating windows and popover-sized surfaces.
    static let panelRadius: CGFloat = 20

    // MARK: Type scale
    //
    // Eight sizes; large text tracks tighter, small caps looser:
    //   display 48 / -1.8 · title 32 / -0.9 · heading 24 / -0.6 · subhead 15
    //   body 14 · label 13 · caption 12 · micro 11 (small caps +0.8)
    // SF Symbols inside controls may use 9–10 as icon sizes.

    static let display = Font.system(size: 48, weight: .bold)
    static let title = Font.system(size: 32, weight: .bold)
    static let heading = Font.system(size: 24, weight: .bold)

    private static let darkText = hex(0x2C2C2B)
    private static let lightText = hex(0xF0EFED)

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
        case .red: return pair(oklch(0.577, 0.215, 27.3), lightText, oklch(0.637, 0.215, 27.3), lightText)
        case .orange: return pair(oklch(0.72, 0.185, 48), darkText, oklch(0.75, 0.175, 48), darkText)
        }
    }

    /// The checkbox ring (and its fill when done) per task color, with the
    /// check drawn on top. The pill colors meant for backgrounds (yellow,
    /// green, mango, orange, grey, lilac) are too light for a thin ring on a white card,
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
        case .red: return pair(oklch(0.577, 0.215, 27.3), oklch(0.637, 0.215, 27.3), darkCheck: lightText)
        case .orange: return pair(oklch(0.66, 0.19, 46), oklch(0.75, 0.175, 48))
        }
    }
}

// MARK: Motion

/// Three motion tokens for the whole app, all springs or short fades, so they
/// can be interrupted. With Reduce Motion on (System Settings › Accessibility),
/// movement becomes a brief cross-fade.
enum Motion {
    static var reduceMotion: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }
    static var reduceTransparency: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency }

    /// Hover and press feedback.
    static var quick: Animation { .easeOut(duration: 0.1) }
    /// Most state changes: toggles, selections, folding.
    static var standard: Animation { reduceMotion ? .easeInOut(duration: 0.15) : .snappy(duration: 0.25) }
    /// Layout moves: the strip, the sidebar, focus mode.
    static var structural: Animation { reduceMotion ? .easeInOut(duration: 0.2) : .smooth(duration: 0.35) }

    /// Slides in from `edge`, or fades with Reduce Motion.
    static func slide(_ edge: Edge) -> AnyTransition {
        reduceMotion ? .opacity : .move(edge: edge).combined(with: .opacity)
    }
}

// MARK: Buttons
//
// One family: PressableButtonStyle (icons and text), PillButtonStyle (secondary
// capsules), MonoPrimaryButtonStyle (the main action) and ToolbarButtonStyle
// (the task sheet's round toolbar). Every one answers a press at once.

/// Plain buttons with instant press feedback: a slight shrink and dim.
struct PressableButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !Motion.reduceMotion ? 0.92 : 1)
            .opacity(configuration.isPressed ? 0.7 : 1)
            .animation(Motion.quick, value: configuration.isPressed)
    }
}

/// Press feedback for views that act on a tap gesture rather than a button
/// (rows, headers): `pressed` is true from mouse-down until the button lifts
/// or the pointer drags away, and resets itself if a drag takes over.
struct PressState: ViewModifier {
    @GestureState private var pressed = false
    var onChange: (Bool) -> Void

    func body(content: Content) -> some View {
        content
            .simultaneousGesture(LongPressGesture(minimumDuration: 60).updating($pressed) { value, state, _ in state = value })
            .onChange(of: pressed) { _, value in onChange(value) }
    }
}

extension View {
    /// Reports mouse-down and release on a tap-gesture view, without taking the tap.
    func onPressChange(_ action: @escaping (Bool) -> Void) -> some View { modifier(PressState(onChange: action)) }

    /// Dims while pressed, like the app's buttons.
    func pressDim() -> some View { modifier(PressDim()) }
}

private struct PressDim: ViewModifier {
    @State private var pressed = false
    func body(content: Content) -> some View {
        content
            .opacity(pressed ? 0.6 : 1)
            .animation(Motion.quick, value: pressed)
            .onPressChange { pressed = $0 }
    }
}

/// Tells its content whether the pointer is over it. Button styles cannot
/// hold state themselves, so the shared styles read hover through this.
struct Hovering<Content: View>: View {
    @ViewBuilder var content: (Bool) -> Content
    @State private var hovering = false
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        // A disabled control does not answer the pointer.
        content(hovering && isEnabled)
            .onHover { hovering = $0 }
            .animation(Motion.quick, value: hovering)
    }
}

extension ButtonStyle where Self == PressableButtonStyle {
    static var pressable: PressableButtonStyle { PressableButtonStyle() }
}

// MARK: Surfaces

extension View {
    /// The sidebar's solid surface, one step off the page.
    func sidebarSurface() -> some View { background(Theme.sidebar) }

    /// A floating surface's material (toast, mini timer), solid with Reduce Transparency.
    @ViewBuilder func floatingMaterial<S: Shape>(in shape: S) -> some View {
        if Motion.reduceTransparency { background(Theme.card, in: shape) } else { background(.regularMaterial, in: shape) }
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
