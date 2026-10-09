/**
 * Inkomoko chart palette (§4.3), assigned in a fixed order by entity, never by rank.
 * The two yellows (#FCBB00, #F99C00) are too close to each other and too light on white
 * to carry a series alone, so charts here use the first three slots; every chart also has
 * a legend/labels so identity never relies on color alone.
 */
export const CHART = {
  coral: "#F05100",
  teal: "#009588",
  deepTeal: "#104E64",
  yellow: "#FCBB00",
  amber: "#F99C00",
} as const;

export const SERIES = {
  conversations: CHART.coral,
  messages: CHART.deepTeal,
  positive: CHART.teal,
  negative: CHART.coral,
  en: CHART.deepTeal,
  am: CHART.coral,
  text: CHART.deepTeal,
  dictation: CHART.teal,
  voice: CHART.coral,
} as const;

export const GRID = "#E5E7EB";
export const AXIS = "#6A7282";
