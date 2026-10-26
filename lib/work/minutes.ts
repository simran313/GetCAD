import { minutesWord } from "@/core";

/**
 * Category time for the screen (redesign): "45 min", "2 h". core keeps the
 * mockups' "45 MIN" form (pinned by its tests); screens read this instead.
 */
export const minutesLabel = (minutes: number | null | undefined) =>
  minutesWord(minutes).replace(/ MIN$/, " min").replace(/ H$/, " h");
