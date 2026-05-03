import React from 'react';

type NativeImageProps = {
  src: string | { src: string };
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
  sizes?: string;
  quality?: number;
  placeholder?: string;
  blurDataURL?: string;
  unoptimized?: boolean;
  onLoad?: () => void;
  onError?: () => void;
};

export default function NativeImage({
  src,
  alt,
  width,
  height,
  fill,
  className,
  style,
}: NativeImageProps) {
  const resolvedSrc =
    typeof src === 'object' && 'src' in src ? src.src : (src as string);
  const imgStyle: React.CSSProperties = fill
    ? {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        ...style,
      }
    : style || {};
  return (
    <img
      src={resolvedSrc}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      className={className}
      style={imgStyle}
    />
  );
}
