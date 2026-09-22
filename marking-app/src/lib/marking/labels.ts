/**
 * Guessing the next question label while someone types a mark scheme.
 *
 * Pure, and kept out of the editor component, so it can be tested without
 * rendering anything. It gives up rather than guessing wrong: a wrong label
 * silently sends a question's marks to the wrong place, whereas an empty box is
 * obvious and takes two seconds to fill in.
 */
export function nextLabel(previous: string): string {
  const trimmed = previous.trim();
  if (/^\d+$/.test(trimmed)) return String(Number(trimmed) + 1);

  const withLetter = /^(\d+)([a-z])$/i.exec(trimmed);
  if (withLetter) {
    const letter = withLetter[2];
    if (letter.toLowerCase() !== "z") return `${withLetter[1]}${String.fromCharCode(letter.charCodeAt(0) + 1)}`;
  }
  return "";
}
