import { SendHorizontal, Square } from "lucide-react";
import type { ChangeEvent, KeyboardEvent, ReactElement, SyntheticEvent } from "react";

import { IconButton } from "../ui/IconButton.js";

export interface ChatComposerProps {
  readonly connectionReady: boolean;
  readonly isGenerating: boolean;
  readonly onCancel: () => void;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly value: string;
}

export function ChatComposer({
  connectionReady,
  isGenerating,
  onCancel,
  onChange,
  onSubmit,
  value,
}: ChatComposerProps): ReactElement {
  const canSubmit = connectionReady && !isGenerating && value.trim().length > 0;

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (canSubmit) {
      onSubmit();
    }
  }

  function change(event: ChangeEvent<HTMLTextAreaElement>): void {
    onChange(event.target.value);
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && canSubmit) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <form className="border-t border-arc-border p-3" onSubmit={submit}>
      <div className="flex items-end gap-2 rounded-md border border-arc-input-border bg-arc-input px-2 py-1.5 focus-within:border-arc-focus focus-within:ring-1 focus-within:ring-arc-focus">
        <textarea
          aria-label="Message Arc"
          className="min-h-6 max-h-28 min-w-0 flex-1 resize-none bg-transparent py-0.5 text-sm text-arc-input-foreground outline-none placeholder:text-arc-muted disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!connectionReady || isGenerating}
          onChange={change}
          onKeyDown={keyDown}
          placeholder={connectionReady ? "Message Arc" : "Waiting for connection"}
          rows={1}
          value={value}
        />
        {isGenerating ? (
          <IconButton className="text-arc-danger hover:text-arc-danger" label="Stop generation" onClick={onCancel}>
            <Square aria-hidden="true" fill="currentColor" size={14} strokeWidth={1.8} />
          </IconButton>
        ) : (
          <IconButton disabled={!canSubmit} label="Send message" type="submit">
            <SendHorizontal aria-hidden="true" size={16} strokeWidth={1.8} />
          </IconButton>
        )}
      </div>
    </form>
  );
}
