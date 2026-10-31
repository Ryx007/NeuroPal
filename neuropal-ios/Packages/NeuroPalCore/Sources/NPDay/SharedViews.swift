import NPCore
import SwiftUI

// Small drawing pieces shared by Home, Pal's sheet and the widgets (NPDay is
// the module all three link; see PalFigure.swift).

/// The shape cue next to every state, so a state never relies on colour
/// alone: okay = circle, a bit off = triangle, overwhelmed = square
/// (StateGlyph.jsx, 12×12 view box).
public struct StateGlyphShape: Shape {
    public let shape: StateShape
    public init(_ shape: StateShape) { self.shape = shape }

    public func path(in rect: CGRect) -> Path {
        let k = min(rect.width, rect.height) / 12
        let o = CGPoint(x: rect.midX - 6 * k, y: rect.midY - 6 * k)
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: o.x + x * k, y: o.y + y * k) }
        var path = Path()
        switch shape {
        case .circle:
            path.addEllipse(in: CGRect(origin: p(1, 1), size: CGSize(width: 10 * k, height: 10 * k)))
        case .triangle:
            path.move(to: p(6, 1))
            path.addLine(to: p(11.5, 11))
            path.addLine(to: p(0.5, 11))
            path.closeSubpath()
        case .square:
            path.addRect(CGRect(origin: p(1, 1), size: CGSize(width: 10 * k, height: 10 * k)))
        }
        return path
    }
}

/// A state's glyph, filled.
public struct StateGlyph: View {
    public let shape: StateShape
    public let color: Color
    public var size: CGFloat

    public init(_ state: NervousState, color: Color, size: CGFloat = 12) {
        self.shape = state.shape
        self.color = color
        self.size = size
    }

    public var body: some View {
        StateGlyphShape(shape).fill(color).frame(width: size, height: size).accessibilityHidden(true)
    }
}

/// Lays its children out in rows, wrapping to a new row when one is full —
/// for button rows that must not clip at large text sizes.
public struct WrapLayout: Layout {
    public var spacing: CGFloat
    public var lineSpacing: CGFloat
    public var alignment: HorizontalAlignment

    public init(spacing: CGFloat = 8, lineSpacing: CGFloat? = nil, alignment: HorizontalAlignment = .leading) {
        self.spacing = spacing
        self.lineSpacing = lineSpacing ?? spacing
        self.alignment = alignment
    }

    public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let width = rows.map(\.width).max() ?? 0
        let height = rows.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: proposal.width.map { min($0, width) } ?? width, height: height)
    }

    public func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x: CGFloat
            switch alignment {
            case .center: x = bounds.minX + (bounds.width - row.width) / 2
            case .trailing: x = bounds.maxX - row.width
            default: x = bounds.minX
            }
            for item in row.items {
                subviews[item.index].place(at: CGPoint(x: x, y: y + (row.height - item.size.height) / 2),
                                           proposal: ProposedViewSize(item.size))
                x += item.size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct Row {
        var items: [(index: Int, size: CGSize)] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        for (i, view) in subviews.enumerated() {
            var size = view.sizeThatFits(.unspecified)
            if size.width > width { size = view.sizeThatFits(ProposedViewSize(width: width, height: nil)) }
            let needed = row.items.isEmpty ? size.width : row.width + spacing + size.width
            if !row.items.isEmpty && needed > width {
                rows.append(row)
                row = Row()
            }
            row.width = row.items.isEmpty ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
            row.items.append((i, size))
        }
        if !row.items.isEmpty { rows.append(row) }
        return rows
    }
}
