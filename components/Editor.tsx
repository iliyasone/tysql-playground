"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import {
  lintGutter,
  setDiagnostics,
  type Diagnostic as CmDiagnostic,
} from "@codemirror/lint";
import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import type { Diagnostic } from "@/lib/api";
import { tysqlDark, tysqlLight } from "@/lib/cmTheme";
import type { Theme } from "@/lib/theme";

export interface EditorHandle {
  focusLine: (line: number, col?: number) => void;
}

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  onRun: () => void;
  theme: Theme;
}

const severityMap: Record<Diagnostic["severity"], CmDiagnostic["severity"]> = {
  error: "error",
  warning: "warning",
  note: "info",
};

/** Clamp a 1-based line/col pair to a valid document position. */
function posFor(view: EditorView, line: number, col: number): number {
  const doc = view.state.doc;
  const safeLine = Math.min(Math.max(line, 1), doc.lines);
  const lineObj = doc.line(safeLine);
  const offset = Math.min(Math.max(col - 1, 0), lineObj.length);
  return lineObj.from + offset;
}

function Editor(
  { value, onChange, diagnostics, onRun, theme }: EditorProps,
  ref: React.Ref<EditorHandle>,
) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  useImperativeHandle(ref, () => ({
    focusLine(line, col = 1) {
      const view = cmRef.current?.view;
      if (!view) return;
      const pos = posFor(view, line, col);
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: "center" }),
      });
      view.focus();
    },
  }));

  // Cmd/Ctrl+Enter runs. Must be a highest-precedence keymap: basicSetup binds
  // Mod-Enter to insertBlankLine, which would otherwise win. `onRun` is a stable
  // callback from the page, so the editor is never reconfigured on keystroke.
  const runKeymap = useMemo(
    () =>
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              onRun();
              return true;
            },
          },
        ]),
      ),
    [onRun],
  );

  const extensions = useMemo(
    () => [python(), lintGutter(), runKeymap, EditorView.lineWrapping],
    [runKeymap],
  );

  // Push server diagnostics into the lint state imperatively. CodeMirror maps
  // these positions through subsequent edits automatically. File-level
  // diagnostics (no line) get no squiggle.
  useEffect(() => {
    const view = cmRef.current?.view;
    if (!view) return;
    const cmDiags: CmDiagnostic[] = [];
    for (const d of diagnostics) {
      if (d.line === null) continue;
      const lineObj = view.state.doc.line(
        Math.min(Math.max(d.line, 1), view.state.doc.lines),
      );
      // No column → mark the whole line; otherwise from the column to line end.
      const from = d.col === null ? lineObj.from : posFor(view, d.line, d.col);
      cmDiags.push({
        from,
        to: lineObj.to,
        severity: severityMap[d.severity],
        message: d.code ? `${d.message}  [${d.code}]` : d.message,
        source: "tysql",
      });
    }
    view.dispatch(setDiagnostics(view.state, cmDiags));
  }, [diagnostics]);

  const handleChange = useCallback((next: string) => onChange(next), [onChange]);

  return (
    <CodeMirror
      ref={cmRef}
      value={value}
      onChange={handleChange}
      theme={theme === "light" ? tysqlLight : tysqlDark}
      extensions={extensions}
      height="100%"
      style={{ height: "100%", fontSize: "13.5px" }}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        foldGutter: false,
        autocompletion: false,
        bracketMatching: true,
        closeBrackets: true,
        indentOnInput: true,
        tabSize: 4,
      }}
    />
  );
}

export default forwardRef(Editor);
