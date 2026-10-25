import Svg, { Circle, Polygon, Rect } from "react-native-svg";

// Shape cue next to every state, so a state never relies on colour alone:
// okay = circle, a bit off = triangle, overwhelmed = square.
export function StateGlyph({ shape, color, size = 12 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      {shape === "circle" ? <Circle cx={6} cy={6} r={5} fill={color} /> : null}
      {shape === "triangle" ? <Polygon points="6,1 11.5,11 0.5,11" fill={color} /> : null}
      {shape === "square" ? <Rect x={1} y={1} width={10} height={10} fill={color} /> : null}
    </Svg>
  );
}
