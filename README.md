# Sublime Security MCP Server

A local [Model Context Protocol](https://modelcontextprotocol.io) server for the
[Sublime Security](https://sublime.security) platform API. Runs over **stdio**, so
it can be spawned by any MCP client (Claude Desktop, Claude Code, etc.).

It exposes tools to analyze email messages, validate detection rules, run
retroactive threat hunts, and perform link/WHOIS enrichment.

> This is the standalone, locally-run replacement for the previous remote
> Cloudflare Worker deployment. Instead of BYOK via an `Authorization: Bearer`
> header, the API key is supplied through the `SUBLIME_API_KEY` environment
> variable.

## Requirements

- Node.js >= 20
- A Sublime Security API key

## Usage

### With Claude Desktop / Claude Code

Add the server to your MCP client config. Once published to npm, it can run
directly via `npx`:

```json
{
  "mcpServers": {
    "sublime-security": {
      "command": "npx",
      "args": ["-y", "sublime-mcp-server"],
      "env": {
        "SUBLIME_API_KEY": "your-sublime-api-key"
      }
    }
  }
}
```

To run from a local checkout instead of npm:

```json
{
  "mcpServers": {
    "sublime-security": {
      "command": "node",
      "args": ["/absolute/path/to/sublime-mcp-server/dist/index.js"],
      "env": {
        "SUBLIME_API_KEY": "your-sublime-api-key"
      }
    }
  }
}
```

### From source

```bash
pnpm install          # or npm install
SUBLIME_API_KEY=... pnpm dev    # run with tsx (no build)
```

## Development

```bash
pnpm build       # compile TypeScript to dist/
pnpm typecheck   # tsc --noEmit
pnpm test        # run vitest
```

## Available tools

| Tool | Description |
| --- | --- |
| `fetchMdmAndMlResults` | Fetch the Message Data Model + ML analysis (NLU, topic modeling) for a canonical ID |
| `fetchMessageHtml` | Fetch only the HTML body content for a message |
| `getResultsOfMqlFunction` | Execute a custom MQL function against a message |
| `runMqlByCanonicalId` | Run a rule / all detection rules / all insights against a message |
| `validateRule` | Validate a detection rule's syntax and logic |
| `analyzeUrl` | Link analysis (screenshot, DOM, threat detection) for a URL |
| `startHunt` | Start a retroactive hunt job over a time range |
| `getHuntResults` | Retrieve hunt job status and results (with pagination / fetch-all) |
| `getWhoisInfo` | WHOIS lookup for a domain |
| `fetchAsaReport` | Fetch the Automated Security Analysis report for a message |

## Security

- The API key is read from `SUBLIME_API_KEY` at startup and used only to build
  the outbound `Authorization: Bearer` header. It is never logged, cached, or
  persisted.
- All outbound requests use `redirect: "manual"` and validate response status
  and `Content-Type` before parsing.
- Tool inputs are validated with [zod](https://zod.dev) schemas.

## License

MIT
