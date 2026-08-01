/* ──────────────────────────────────────────────────────────────────────────
   Which keystrokes are ours.

   No `server-only` and no React: three callers — the hook, the help dialog and
   the offline suite. `isTypingTarget` is the whole safety rule of the shortcut
   system reduced to one function, which is exactly the kind of thing that should
   be tested rather than reasoned about in a `keydown` handler.
   ────────────────────────────────────────────────────────────────────────── */

/** What `swallowsKeys` needs to know about the focused element. */
export interface TypingProbe {
  tagName: string;
  /** `type` for an `<input>`, undefined for anything else. */
  inputType?: string;
  contentEditable: boolean;
  /** Focus is inside an open dialog, menu or listbox. */
  insideOverlay: boolean;
}

/**
 * Whether a keystroke belongs to whatever the user is typing in.
 *
 * The single rule the entire shortcut system rests on. Get it wrong in the
 * permissive direction and pressing `m` in the middle of a reply assigns the
 * ticket to yourself and drops an `m` — a silent, wrong write, from a keystroke
 * the person meant as a letter.
 *
 * Pure, and split from the DOM read below so it can be asserted in `npm test`
 * rather than reasoned about inside a `keydown` handler. Four things count as
 * typing, and the last two are the ones that get forgotten:
 *
 * - `<input>`, except the ones with no text in them — a checkbox or a radio does
 *   not swallow letters, and a form full of switches should not disable the
 *   shortcuts of the page it sits on.
 * - `<textarea>` and `<select>`.
 * - **`contenteditable`**, which is what the rich-text editor actually is. It is
 *   not an input element, so an `instanceof HTMLInputElement` check misses it
 *   entirely — and the reply editor is the single most likely place for somebody
 *   to type an `r`.
 * - Anything inside an open dialog or menu. Radix moves focus to the panel
 *   itself, which is a `<div>`; a shortcut firing behind an open modal acts on a
 *   page the user cannot see.
 */
export function swallowsKeys(probe: TypingProbe): boolean {
  if (probe.contentEditable) return true;
  if (probe.insideOverlay) return true;

  const tag = probe.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;

  if (tag === "INPUT") {
    // The types that hold no text still fire keydown.
    return !NON_TEXT_INPUTS.includes(probe.inputType ?? "text");
  }

  return false;
}

const NON_TEXT_INPUTS = [
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "file",
];

/** The DOM half: read the element, then ask `swallowsKeys`. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;

  return swallowsKeys({
    tagName: target.tagName,
    inputType:
      target instanceof HTMLInputElement ? target.type : undefined,
    contentEditable: target.isContentEditable,
    // `closest` catches focus anywhere inside an overlay, not only on its root.
    insideOverlay:
      target.closest('[role="dialog"], [role="menu"], [role="listbox"]') !== null,
  });
}

/**
 * Whether a keystroke is a plain letter press rather than a browser command.
 *
 * `Ctrl+R` reloads and `Cmd+M` minimises; claiming those would be taking a
 * keystroke the operating system already owns. Shift is allowed through because
 * `?` is one.
 */
export function isPlainKey(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey;
}

export interface ShortcutHelp {
  keys: string[];
  description: string;
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutHelp[];
}

/**
 * The help dialog's contents, declared here rather than assembled from the
 * handlers.
 *
 * A generated list would be honest about what is bound and useless as
 * documentation — it cannot say what `c` means, only that something listens for
 * it. This is a written reference, and `npm test` checks that every key named
 * here is unique within its group, which is the failure that actually happens:
 * two handlers on one page both claiming `r`.
 */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Überall",
    items: [
      { keys: ["Strg", "K"], description: "Ticket suchen" },
      { keys: ["?"], description: "Diese Übersicht" },
      { keys: ["Esc"], description: "Dialog schließen, Eingabe verlassen" },
    ],
  },
  {
    title: "Queue",
    items: [
      { keys: ["J"], description: "Eine Zeile tiefer" },
      { keys: ["K"], description: "Eine Zeile höher" },
      { keys: ["Enter"], description: "Markiertes Ticket öffnen" },
      { keys: ["C"], description: "Zuständigkeit umschalten" },
    ],
  },
  {
    title: "Ticket",
    items: [
      { keys: ["R"], description: "In die Antwortzeile springen" },
      { keys: ["M"], description: "Mir zuweisen" },
      { keys: ["I"], description: "Interne Notiz umschalten" },
      { keys: ["P"], description: "Als Fenster anpinnen" },
      { keys: ["Strg", "Enter"], description: "Antwort absenden" },
      { keys: ["Umschalt", "Enter"], description: "Antwort absenden" },
    ],
  },
];
