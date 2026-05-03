export function hashToHsl(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  const hue = hash % 360;
  const saturation = 52 + (hash % 18);
  const lightness = 38 + (hash % 10);

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}
