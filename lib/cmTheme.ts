import { createTheme } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";

// Light counterpart: same role→hue mapping as tysqlDark, darkened for white.
export const tysqlLight = createTheme({
  theme: "light",
  settings: {
    background: "#fbfcfd",
    backgroundImage: "",
    foreground: "#1a1d22",
    caret: "#4c63d2",
    // The active-line highlight must stay translucent: it renders above the
    // selection layer, so an opaque tint would hide the real selection while
    // leaving the (content-layer) match highlights visible — making other
    // occurrences look more selected than the actual one.
    selection: "#b3c6f5",
    selectionMatch: "rgba(76, 99, 210, 0.16)",
    lineHighlight: "rgba(26, 29, 34, 0.045)",
    gutterBackground: "#fbfcfd",
    gutterForeground: "#aeb5c0",
    gutterActiveForeground: "#4a515c",
    gutterBorder: "transparent",
    fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
  },
  styles: [
    { tag: t.comment, color: "#8b929d", fontStyle: "italic" },
    { tag: [t.string, t.special(t.string)], color: "#2f8a3e" },
    { tag: [t.number, t.bool, t.null], color: "#b5560f" },
    { tag: t.keyword, color: "#8a3fd0" },
    { tag: [t.definitionKeyword, t.moduleKeyword], color: "#8a3fd0" },
    { tag: [t.className, t.typeName, t.namespace], color: "#9a6a00" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#3b5bd4" },
    { tag: [t.variableName, t.propertyName], color: "#1a1d22" },
    { tag: [t.operator, t.operatorKeyword], color: "#5b636e" },
    { tag: [t.bracket, t.punctuation, t.separator], color: "#6b727d" },
    { tag: t.self, color: "#c23b3b" },
    { tag: t.meta, color: "#5b636e" },
  ],
});

// Custom near-black theme tuned to the playground palette.
export const tysqlDark = createTheme({
  theme: "dark",
  settings: {
    background: "#0b0c0e",
    backgroundImage: "",
    foreground: "#e6e8ec",
    caret: "#7c9cff",
    // Translucent active-line tint — see the light theme note above.
    selection: "#35527f",
    selectionMatch: "rgba(124, 156, 255, 0.16)",
    lineHighlight: "rgba(230, 232, 236, 0.04)",
    gutterBackground: "#0b0c0e",
    gutterForeground: "#5b626d",
    gutterActiveForeground: "#aeb6c2",
    gutterBorder: "transparent",
    fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
  },
  styles: [
    { tag: t.comment, color: "#5f6672", fontStyle: "italic" },
    { tag: [t.string, t.special(t.string)], color: "#8fd18a" },
    { tag: [t.number, t.bool, t.null], color: "#e0a878" },
    { tag: t.keyword, color: "#c98fff" },
    { tag: [t.definitionKeyword, t.moduleKeyword], color: "#c98fff" },
    { tag: [t.className, t.typeName, t.namespace], color: "#f2c744" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#7c9cff" },
    { tag: [t.variableName, t.propertyName], color: "#e6e8ec" },
    { tag: [t.operator, t.operatorKeyword], color: "#9aa2ad" },
    { tag: [t.bracket, t.punctuation, t.separator], color: "#8b929d" },
    { tag: t.self, color: "#e07a7a" },
    { tag: t.meta, color: "#9aa2ad" },
  ],
});
