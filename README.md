# pi-inline-complete

DeepSeek-powered inline ghost-text completion for pi's interactive input editor.

When you pause typing in pi, this extension sends the current draft plus recent conversation context to DeepSeek's beta FIM completion API. The returned text appears after the cursor in dim ghost text. Press `Tab` to accept the prediction. If no prediction is visible, `Tab` keeps pi's normal slash/path autocomplete behavior.

## Install

From a local checkout:

```bash
pi install "$(pwd)"
```

For development without installing:

```bash
pi -e "$(pwd)"
```

After publishing to npm or pushing to git, install the npm or git package source with `pi install`.

## Configuration

Set `DEEPSEEK_API_KEY` to your actual DeepSeek API key before starting pi.

The first version uses fixed runtime settings:

- Model: `deepseek-v4-flash`
- Endpoint: `https://api.deepseek.com/beta/completions`
- Debounce: 600 ms
- Max completion length: 64 tokens
- Request timeout: 8 seconds

## Behavior

- Predictions trigger after typing, deletion, paste, newline insertion, or cursor movement, once input has at least 3 non-whitespace characters.
- Pending requests are aborted when the editor changes.
- Stale responses are discarded.
- `Tab` accepts a visible prediction before invoking native autocomplete.
- Without a visible prediction, pi's native autocomplete still handles `Tab`.
- The extension only runs in interactive UI sessions.

## Privacy

Data sent to DeepSeek:

- Current pi input editor text.
- Recent user and assistant text from the active pi session.

Data not sent to DeepSeek:

- Project files that are not already in the conversation.
- Arbitrary local files.
- Git metadata or command output unless already present in the conversation.

## Development

Install dependencies:

```bash
npm install
```

Run verification:

```bash
npm run check
```

Manual interactive verification:

```bash
test -n "$DEEPSEEK_API_KEY"
pi -e "$(pwd)"
```

Then type a prompt, pause for about 600 ms, confirm dim text appears after the cursor, and press `Tab` to accept it.
