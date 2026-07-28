import type { Extension } from "@codemirror/state";
import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { extensionOf } from "@/features/files/file-kind";

export function languageExtensionFor(name: string): Extension | null {
  const ext = extensionOf(name);
  switch (ext) {
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return javascript({ jsx: true });
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return javascript({ jsx: true, typescript: true });
    case "json":
    case "jsonc":
    case "json5":
      return json();
    case "html":
    case "htm":
    case "xhtml":
    case "vue":
    case "svelte":
      return html();
    case "css":
    case "scss":
    case "sass":
    case "less":
      return css();
    case "py":
    case "pyi":
      return python();
    case "md":
    case "markdown":
    case "mdx":
      return markdown();
    case "xml":
    case "svg":
    case "plist":
      return xml();
    case "yaml":
    case "yml":
      return yaml();
    case "rs":
      return rust();
    case "c":
    case "h":
    case "cc":
    case "cpp":
    case "cxx":
    case "hpp":
    case "hh":
      return cpp();
    case "php":
      return php();
    case "sql":
      return sql();
    default:
      return null;
  }
}
