/**
 * Renders a block-character progress bar.
 *
 * @param percent - Value 0–100.
 * @param width   - Total character width of the bar.
 */
export function barGraph(percent: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}
