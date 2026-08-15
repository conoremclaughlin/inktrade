import Svg, { Path, Polyline } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
}

/**
 * Hand-drawn tab icons rather than an icon package.
 *
 * Two icons don't justify a dependency, and drawing them here keeps the stroke
 * weight consistent with the rest of the app's react-native-svg work.
 */

export function PortfolioIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="3,16 9,10 13,14 21,6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16 6h5v5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ListsIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {[6, 12, 18].map((y) => (
        <Path
          key={y}
          d={`M9 ${y}h11`}
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      ))}
      {[6, 12, 18].map((y) => (
        <Path
          key={`dot-${y}`}
          d={`M4 ${y}h0.01`}
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}

/**
 * Two arrows crossing — buy and sell, the exchange.
 *
 * Deliberately not a dollar sign: the tab is where orders are placed, not
 * where money is displayed.
 */
export function TradeIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8h13M13 4l4 4-4 4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M20 16H7M11 12l-4 4 4 4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * A ladder — rungs at even intervals, which is exactly what a strike ladder is.
 */
export function ChainIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 3v18M17 3v18" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      {[7, 12, 17].map((y) => (
        <Path key={y} d={`M7 ${y}h10`} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

/** A payoff curve — the shape the calculator is about. */
export function CalculatorIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 18h18"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        opacity={0.45}
      />
      <Path
        d="M3 18h7l11-12"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** A gear, for the header button that reaches Settings. */
export function SettingsIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke={color}
        strokeWidth={1.7}
      />
      <Path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.08A1.7 1.7 0 0 0 10 3.05V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.08a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
