import type { Tab } from "@/core";

/**
 * One icon set, drawn once, used by both navigations — the glyphs of the
 * mockups (docs/design): 24-unit grid, 1.5 stroke, square caps and mitred
 * joins, inheriting colour from the link around them.
 */
export const NAV_ICONS: Record<Tab["icon"], React.ReactNode> = {
  home: <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  list: (
    <>
      <path d="M5 4h14v16H5z" />
      <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" />
    </>
  ),
  work: (
    <>
      <path d="M3.5 8h17v11h-17z" />
      <path d="M9 8V5.5h6V8" />
    </>
  ),
  queue: (
    <>
      <path d="M4 5h16v9h-5l-1.5 2h-3L9 14H4z" />
      <path d="M4 18.5h16" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.2-3.5 3.8-5.5 7-5.5s5.8 2 7 5.5" />
    </>
  ),
  message: <path d="M4 5h16v11H10l-6 4z" />,
  wallet: (
    <>
      <path d="M3.5 6.5h17v13h-17z" />
      <path d="M15.5 13h2" />
      <path d="M3.5 10h17" />
    </>
  ),
  money: (
    <>
      <path d="M3.5 6.5h17v13h-17z" />
      <path d="M15.5 13h2" />
      <path d="M3.5 10h17" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </>
  ),
  board: <path d="M4 4h4.5v16H4zM9.75 4h4.5v11h-4.5zM15.5 4H20v8h-4.5z" />,
};

/** The glyph at a given size, with the shared stroke treatment. */
export function NavIcon({ icon, className }: { icon: Tab["icon"]; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
    >
      {NAV_ICONS[icon]}
    </svg>
  );
}
