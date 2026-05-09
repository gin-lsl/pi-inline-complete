# Inline Completion Pi Package Design

Date: 2026-05-09

## Summary

Build a distributable pi package that provides inline predictive text in pi's interactive input editor. When the user pauses typing, the extension asks DeepSeek FIM for a completion based on the current input and recent conversation context. The predicted text is rendered after the cursor in a dim/ghost style. If a prediction exists, `Tab` accepts it; otherwise `Tab` keeps pi's built-in autocomplete behavior.

## Package Structure

The package will be installable through pi package mechanisms, for example from a git repository or npm package.

```text
pi-inline-complete/
  package.json
  README.md
  extensions/
    inline-complete.ts
  src/                  # optional if implementation grows beyond one file
  test/                 # optional tests/helpers
```

`package.json` will include the `pi-package` keyword and a `pi.extensions` entry pointing at the extension file. Runtime peer dependencies will include pi-provided packages such as `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui` as needed.

## Runtime Architecture

On `session_start`, the extension only enables itself when pi has an interactive UI. It replaces the editor component with an `InlineCompletionEditor` that extends pi's `CustomEditor`.

The editor is responsible for:

1. Tracking the current input text and cursor position.
2. Scheduling a debounced DeepSeek FIM request after input changes.
3. Rendering valid predictions as ghost text after the cursor.
4. Accepting a prediction with `Tab` before falling back to pi's built-in autocomplete behavior.

The extension does not read project files and does not bind to a specific repository. It uses only the current editor text and recent conversation messages from the active pi session.

## DeepSeek Integration

Configuration is intentionally minimal for the first version:

- API key: `DEEPSEEK_API_KEY`
- Model: `deepseek-v4-flash`
- Endpoint: `https://api.deepseek.com/beta/completions`
- API style: DeepSeek FIM completion
- Debounce: 600 ms
- Max completion length: 64 tokens
- Request timeout: 8 seconds

The FIM request uses an OpenAI-compatible completions call with `Authorization: Bearer <DEEPSEEK_API_KEY>`:

- `prompt`: recent conversation context plus text before the cursor
- `suffix`: text after the cursor
- `max_tokens`: 64
- `model`: `deepseek-v4-flash`

The extension reads the inserted text from `choices[0].text`. DeepSeek's beta FIM API is preferred over chat prefix completion because it supports filling text at the cursor when there is already text after the cursor.

## Prediction Triggering

A prediction request is scheduled after user-driven editor changes, including typing, deletion, paste, newline insertion, and cursor movement. The editor clears the current prediction when the input or cursor changes.

The extension skips requests when:

- `DEEPSEEK_API_KEY` is missing.
- The editor text is empty or has fewer than roughly 3 non-whitespace characters.
- The current input/cursor snapshot has already become stale.
- pi is not in an interactive UI mode.
- The extension is in temporary backoff after repeated API/network failures.

If the user edits while a request is pending, the extension aborts the old request and discards any late response using a monotonically increasing request id/snapshot token.

## Context Construction

The context sent to DeepSeek includes:

1. Recent user/assistant text messages from `ctx.sessionManager.getBranch()`.
2. The current draft before the cursor.
3. The current draft after the cursor as FIM suffix.

Recent conversation context is truncated to a small fixed budget, approximately 3000-5000 characters. It is formatted as a compact plain-text block, for example:

```text
[Recent conversation context]
User: ...
Assistant: ...

[Current draft before cursor]
...
```

The prompt instruction tells the model to return only the next text to insert at the cursor, without explanations, markdown fences, or repeated surrounding text.

The extension does not include local file contents unless they already appear in the conversation history.

## Response Cleaning

DeepSeek responses are cleaned before display:

- Normalize line endings.
- Preserve intentional leading whitespace when it is needed to separate words, but trim excessive blank lines or whitespace-only responses.
- Remove markdown fences or obvious explanatory prefixes if present.
- Limit display length for ghost rendering while retaining the full accepted prediction, subject to configured max tokens.
- Avoid duplicating text that already appears immediately after the cursor.
- Drop empty or whitespace-only predictions.

## Rendering Behavior

`InlineCompletionEditor.render(width)` calls `super.render(width)` to keep pi's native editor layout, cursor, scrolling, paste markers, and autocomplete UI.

If a prediction is still valid for the current text/cursor snapshot, the editor inserts a dim/ghost styled version of the prediction into the rendered line containing the cursor. The display uses the current theme, for example `theme.fg("dim", prediction)`.

Rendering constraints:

- Each rendered line must stay within the terminal width.
- If the prediction is too long, only the portion that fits on the current visible line is shown.
- The full prediction is inserted when accepted.
- Ghost text disappears on input changes, submit, or stale request detection.

## Keyboard Interaction

When `Tab` is pressed:

1. If a valid prediction exists, insert it at the current cursor with `insertTextAtCursor(prediction)`, clear the prediction, and schedule a new debounce if appropriate.
2. If no valid prediction exists, call `super.handleInput(data)` so pi's native slash/path autocomplete behavior remains unchanged.

This gives prediction acceptance priority over existing autocomplete exactly when a prediction is visible.

## Error Handling

Error behavior is quiet and non-disruptive:

- Missing `DEEPSEEK_API_KEY`: do not request predictions. Optionally show a one-time notification.
- 401/403: show a one-time notification that the API key may be invalid and pause predictions for the session.
- 429, 5xx, or network errors: enter a short backoff, for example 30 seconds, and avoid repeated notifications.
- Timeout: abort after about 8 seconds and silently drop the prediction.
- Extension errors should not block pi's normal editor behavior.

## Privacy Boundary

Data sent to DeepSeek:

- Current pi input editor text.
- Recent conversation text from the active pi session.

Data not sent to DeepSeek:

- Project file contents that are not already in conversation history.
- Arbitrary local files.
- Git metadata or shell output unless already present in the conversation.

The README will document this boundary clearly.

## Non-Goals for MVP

The first version will not include:

- A configuration command.
- Per-project config files.
- User-adjustable model, debounce, or token settings.
- Prediction caching.
- Offline/local model support.
- Non-interactive mode support.
- Project file indexing or retrieval.

## Testing Strategy

### Unit Tests / Pure Helpers

Test pure helpers for:

- Splitting current text at cursor.
- Building and truncating recent conversation context.
- Cleaning DeepSeek responses.
- Dropping stale request results.
- Avoiding duplication with the suffix.

### Editor Behavior Tests

Where practical, test editor behavior with a fake completion service:

- Prediction is cleared on input changes.
- `Tab` inserts a visible valid prediction.
- `Tab` falls through to native behavior when no prediction exists.
- Cursor movement invalidates old predictions.

### Manual Integration Verification

Manual verification steps:

1. Set `DEEPSEEK_API_KEY`.
2. Run pi with the package as a local extension during development, for example `pi -e ./pi-inline-complete`.
3. Type a prompt and pause for the debounce window.
4. Confirm dim ghost text appears after the cursor.
5. Press `Tab` and confirm the text is inserted.
6. Move the cursor into the middle of text and confirm FIM inserts at the cursor.
7. Confirm slash/path autocomplete still works when no prediction is visible.

## Open Implementation Notes

The main implementation risk is robust ghost-text rendering because pi's editor render output already includes cursor highlighting, ANSI codes, wrapping, and optional autocomplete rows. The implementation should keep this logic isolated in a small rendering helper and favor conservative behavior: if it cannot safely identify the cursor row or available width, it should skip ghost rendering rather than corrupting the input display.
