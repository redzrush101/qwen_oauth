# qwen_oauth

Qwen OAuth provider for pi for `coder-model` (Qwen 3.6 Plus).

Uses pi's built-in `openai-completions` provider flow and `/login` OAuth UX, with a Qwen device-code + PKCE login against `https://chat.qwen.ai`.

## Install

### Option 1: install globally with `pi install`

```bash
pi install https://github.com/redzrush101/qwen_oauth
```

Or:

```bash
pi install git:github.com/redzrush101/qwen_oauth
```

### Option 2: git clone into pi's global extensions directory

```bash
git clone https://github.com/redzrush101/qwen_oauth ~/.pi/agent/extensions/qwen_oauth
cd ~/.pi/agent/extensions/qwen_oauth
npm install
```

### Option 3: run it directly with `pi -e`

From this repo:

```bash
npm install
pi -e .
```

## Use

After pi starts, run:

```text
/login qwen-oauth
```

## Notes

- targets `coder-model`
- uses `resource_url` from OAuth credentials to choose the runtime base URL
- falls back to `https://dashscope.aliyuncs.com/compatible-mode/v1`
- patches request payloads in `before_provider_request` for Qwen-specific metadata and cache-control behavior

## Validation

```bash
npm install
npm run check
```

## License

LGPL-3.0. See [LICENSE](./LICENSE).
