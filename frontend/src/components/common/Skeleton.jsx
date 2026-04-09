import React from 'react';

export default function Skeleton({
  width = '100%',
  height = 14,
  radius = 8,
  style = {},
  className = ''
}) {
  return (
    <span
      className={`ryflow-skeleton ${className}`.trim()}
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        ...style
      }}
      aria-hidden="true"
    />
  );
}
