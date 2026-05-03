

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/transparent.png"
      alt="LeTrend"
      width={size}
      height={size}
      style={{
        objectFit: 'contain'
      }}
    />
  );
}
