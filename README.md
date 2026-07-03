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

This repo uses **pnpm** (pinned via `packageManager` and `.mise.toml`). Run
`mise install` to get the pinned pnpm/node/sfw versions.

Wrap every install-type command with [Socket Firewall](https://docs.socket.dev/docs/socket-firewall-free)
(`sfw`) so downloads are screened for malicious packages:

```bash
sfw pnpm install          # install deps (screened)
sfw pnpm add <pkg>@latest # add a dep (screened)
```

pnpm is configured (in `pnpm-workspace.yaml`) with a 7-day publish cooldown
(`minimumReleaseAge`) and `trustPolicy: no-downgrade` to reject updates that drop
npm provenance. When a security fix needs a package inside the cooldown window,
add a pinned entry to `minimumReleaseAgeExclude` with a GHSA/CVE comment.

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

## Releasing

CI (`.github/workflows/ci.yml`) runs typecheck + build + test on every PR and
push to `main`. All actions are pinned to commit SHAs.

Publishing uses npm [**staged publishing**](https://docs.npmjs.com/staged-publishing)
via `.github/workflows/publish.yml`, which triggers on a published GitHub
Release:

1. The workflow runs `npm stage publish` (OIDC trusted publishing, provenance
   attached automatically — no npm token stored in the repo). This **submits**
   the release to npm's staging area; it does not go live.
2. A maintainer reviews and approves it out-of-band with 2FA — either
   `npm stage approve <stage-id>` or the **Staged Packages** tab on npmjs.com.

First-time setup (one-off, because staging cannot create a new package):

1. Publish the initial version manually: `pnpm build && npm publish --access public`.
2. On npmjs.com, configure a **Trusted Publisher** (OIDC) pointing at this repo
   and the `publish.yml` workflow.
3. Subsequent releases flow through the staged-publish workflow.

Requires npm >= 11.15.0 and Node >= 22.14.0 (the workflow upgrades npm; local
maintainers approving a stage need it too).

## Security

- The API key is read from `SUBLIME_API_KEY` at startup and used only to build
  the outbound `Authorization: Bearer` header. It is never logged, cached, or
  persisted.
- All outbound requests use `redirect: "manual"` and validate response status
  and `Content-Type` before parsing.
- Tool inputs are validated with [zod](https://zod.dev) schemas.

## License

MIT
