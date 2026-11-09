import Foundation

/// A port of npm `fractional-indexing` (base 62), so positions written here sort
/// exactly like the ones the web app writes.
enum FractionalIndex {
    static let digits = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
    private static let zero = digits[0]
    private static let smallestInteger = "A" + String(repeating: "0", count: 26)

    enum Failure: Error { case invalid(String) }

    private static func index(of c: Character) -> Int { digits.firstIndex(of: c)! }

    private static func midpoint(_ a: [Character], _ b: [Character]?) throws -> [Character] {
        if let b, !(lexLess(a, b)) { throw Failure.invalid("\(String(a)) >= \(String(b))") }
        if a.last == zero || (b?.last == zero) { throw Failure.invalid("trailing zero") }
        if let b {
            var n = 0
            while (n < a.count ? a[n] : zero) == (n < b.count ? b[n] : nil) { n += 1 }
            if n > 0 {
                return Array(b[0..<n]) + (try midpoint(Array(a.dropFirst(n)), Array(b.dropFirst(n))))
            }
        }
        let digitA = a.isEmpty ? 0 : index(of: a[0])
        let digitB = b.map { index(of: $0[0]) } ?? digits.count
        if digitB - digitA > 1 {
            let mid = Int((0.5 * Double(digitA + digitB)).rounded())
            return [digits[mid]]
        }
        if let b, b.count > 1 { return [b[0]] }
        return [digits[digitA]] + (try midpoint(Array(a.dropFirst()), nil))
    }

    private static func lexLess(_ a: [Character], _ b: [Character]) -> Bool {
        String(a) < String(b)
    }

    private static func integerLength(_ head: Character) throws -> Int {
        let v = head.asciiValue ?? 0
        if head >= "a" && head <= "z" { return Int(v) - Int(Character("a").asciiValue!) + 2 }
        if head >= "A" && head <= "Z" { return Int(Character("Z").asciiValue!) - Int(v) + 2 }
        throw Failure.invalid("head \(head)")
    }

    private static func integerPart(_ key: [Character]) throws -> [Character] {
        let length = try integerLength(key[0])
        guard length <= key.count else { throw Failure.invalid(String(key)) }
        return Array(key[0..<length])
    }

    private static func validate(_ key: [Character]) throws {
        if String(key) == smallestInteger { throw Failure.invalid(String(key)) }
        let i = try integerPart(key)
        if key.count > i.count, key.last == zero { throw Failure.invalid(String(key)) }
    }

    private static func increment(_ x: [Character]) -> [Character]? {
        let head = x[0]
        var digs = Array(x.dropFirst())
        var carry = true
        var i = digs.count - 1
        while carry && i >= 0 {
            let d = index(of: digs[i]) + 1
            if d == digits.count { digs[i] = zero } else { digs[i] = digits[d]; carry = false }
            i -= 1
        }
        if !carry { return [head] + digs }
        if head == "Z" { return ["a", zero] }
        if head == "z" { return nil }
        let h = Character(UnicodeScalar(head.asciiValue! + 1))
        if h > "a" { digs.append(zero) } else { digs.removeLast() }
        return [h] + digs
    }

    private static func decrement(_ x: [Character]) -> [Character]? {
        let head = x[0]
        var digs = Array(x.dropFirst())
        var borrow = true
        var i = digs.count - 1
        while borrow && i >= 0 {
            let d = index(of: digs[i]) - 1
            if d == -1 { digs[i] = digits.last! } else { digs[i] = digits[d]; borrow = false }
            i -= 1
        }
        if !borrow { return [head] + digs }
        if head == "a" { return ["Z", digits.last!] }
        if head == "A" { return nil }
        let h = Character(UnicodeScalar(head.asciiValue! - 1))
        if h < "Z" { digs.append(digits.last!) } else { digs.removeLast() }
        return [h] + digs
    }

    /// A key strictly between `a` and `b` (nil is the start or end of the list).
    static func keyBetween(_ a: String?, _ b: String?) throws -> String {
        let a = a.map(Array.init), b = b.map(Array.init)
        if let a { try validate(a) }
        if let b { try validate(b) }
        if let a, let b, !lexLess(a, b) { throw Failure.invalid("\(String(a)) >= \(String(b))") }

        guard let a else {
            guard let b else { return "a" + String(zero) }
            let ib = try integerPart(b)
            let fb = Array(b.dropFirst(ib.count))
            if String(ib) == smallestInteger { return String(ib + (try midpoint([], fb))) }
            if lexLess(ib, b) { return String(ib) }
            guard let res = decrement(ib) else { throw Failure.invalid("cannot decrement") }
            return String(res)
        }
        guard let b else {
            let ia = try integerPart(a)
            let fa = Array(a.dropFirst(ia.count))
            if let i = increment(ia) { return String(i) }
            return String(ia + (try midpoint(fa, nil)))
        }
        let ia = try integerPart(a), fa = Array(a.dropFirst(ia.count))
        let ib = try integerPart(b), fb = Array(b.dropFirst(ib.count))
        if ia == ib { return String(ia + (try midpoint(fa, fb))) }
        guard let i = increment(ia) else { throw Failure.invalid("cannot increment") }
        if lexLess(i, b) { return String(i) }
        return String(ia + (try midpoint(fa, nil)))
    }

    /// Like the web app's `positionBetween`: falls back to a key after `after`
    /// when the bounds are not in order (two devices wrote the same key).
    static func positionBetween(_ after: String?, _ before: String?) -> String {
        if let after, let before, after >= before {
            return (try? keyBetween(after, nil)) ?? after + "V"
        }
        return (try? keyBetween(after, before)) ?? ((try? keyBetween(after, nil)) ?? "a0")
    }
}
