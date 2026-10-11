export function luminance(colour: string): number | undefined {
  const match = /^rgba?\(([^)]+)\)$/.exec(colour.trim());
  if (!match) return undefined;
  const values = match[1].trim().split(/[\s,/]+/).map(Number);
  if (values.length < 3 || values.length > 4 || values.some(value => !Number.isFinite(value))
      || values.slice(0,3).some(value => value < 0 || value > 255)
      || (values.length === 4 && (values[3] <= 0 || values[3] > 1))) return undefined;
  const [r,g,b] = values.slice(0,3).map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function isDarkTheme(background: string, text: string): boolean {
  return (luminance(background) ?? 1) < 0.4 || (luminance(text) ?? 0) > 0.6;
}
