// components/SquidIcon.tsx
import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

interface SquidIconProps {
  size?: number;
  color?: string; // Teal body color
  visorColor?: string; // Green visor color
}

export function SquidIcon({ 
  size = 32, 
  color = "#00B29A", 
  visorColor = "#73D13D" 
}: SquidIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* 1. Solid Head & Body (Extends behind eyes so they aren't floating) */}
      <Path
        d="M50 4 L78 38 C80 48 76 60 68 62 L32 62 C24 60 20 48 22 38 Z"
        fill={color}
      />

      {/* 2. Green Visor / Headband */}
      <Rect
        x="22"
        y="30"
        width="56"
        height="12"
        rx="6"
        fill={visorColor}
      />

      {/* 3. Eyes Resting Solidly on Teal Body */}
      {/* Left Eye */}
      <Circle cx="38" cy="48" r="9" fill="#FFFFFF" />
      <Circle cx="39" cy="49" r="5" fill="#0F172A" />
      <Circle cx="41" cy="46" r="2" fill="#FFFFFF" />

      {/* Right Eye */}
      <Circle cx="62" cy="48" r="9" fill="#FFFFFF" />
      <Circle cx="63" cy="49" r="5" fill="#0F172A" />
      <Circle cx="65" cy="46" r="2" fill="#FFFFFF" />

      {/* 4. Cute, Short Tentacles (Shortened length so it doesn't look leggy) */}
      {/* Outer Left */}
      <Path
        d="M23 58 C 12 62, 10 74, 18 80"
        fill="none"
        stroke={color}
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      {/* Inner Left */}
      <Path
        d="M36 62 C 30 70, 32 78, 38 82"
        fill="none"
        stroke={color}
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      {/* Inner Right */}
      <Path
        d="M64 62 C 70 70, 68 78, 62 82"
        fill="none"
        stroke={color}
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      {/* Outer Right */}
      <Path
        d="M77 58 C 88 62, 90 74, 82 80"
        fill="none"
        stroke={color}
        strokeWidth="7.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}