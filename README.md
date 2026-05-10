# pi-inline-complete

DeepSeek-powered inline ghost-text completion for pi's interactive input editor.

When you pause typing in pi, this extension sends the current draft plus recent conversation context to DeepSeek's beta FIM completion API. The returned text appears after the cursor in dim ghost text. Press `Tab` to accept the prediction. If no prediction is visible, `Tab` keeps pi's normal slash/path autocomplete behavior.

## Install

### Prerequisites

A [DeepSeek API key](https://platform.deepseek.com/api_keys) with access to the FIM completion beta.

### Quick install

```bash
pi install git:github.com/gin-lsl/pi-inline-complete
```

This installs the extension globally (available in all projects). To scope it to the current project only, add `-l`:

```bash
pi install -l git:github.com/gin-lsl/pi-inline-complete
```

### Alternative source

If you have the source cloned locally:

```bash
pi install /path/to/pi-inline-complete
```

## Configuration

The extension uses pi's built-in auth system to retrieve the DeepSeek API key. Configure it through pi's `/login` command (select DeepSeek), or set the `DEEPSEEK_API_KEY` environment variable before launching pi.

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
pi -e .
```

Then type a prompt, pause for about 600 ms, confirm dim text appears after the cursor, and press `Tab` to accept it.
