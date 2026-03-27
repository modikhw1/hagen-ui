import Image from 'next/image';

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Image
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
