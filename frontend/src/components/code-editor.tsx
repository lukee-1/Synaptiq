"use client";
import dynamic from "next/dynamic";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => <div className="editor-skeleton skeleton" />,
});
export function CodeEditor({
  code,
  onChange,
  readOnly = false,
}: {
  code: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <CodeMirror
      value={code}
      height="350px"
      theme={oneDark}
      extensions={[python()]}
      onChange={onChange}
      readOnly={readOnly}
      aria-label="Python code editor"
      basicSetup={{
        foldGutter: true,
        lineNumbers: true,
        highlightActiveLine: true,
      }}
    />
  );
}
