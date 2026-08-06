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
