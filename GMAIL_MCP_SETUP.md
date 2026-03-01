# Gmail MCP setup for invite-response verification

This MCP lets the Cursor AI read the mailbox that receives calendar invite responses (accept/decline/tentative) so you can verify the invite pipeline is working.

**Decision:** Use **Gmail MCP** (Option A from the plan). The mailbox that receives invite replies is the Gmail inbox of the Google account that owns the calendar (same account used for Calendar OAuth). Server: [jasonsum/gmail-mcp-server](https://github.com/jasonsum/gmail-mcp-server).

**We use the same OAuth as Calendar.** The app already has Google OAuth set up (web flow with `GOOGLE_REDIRECT_URI`). The Gmail MCP does **not** run its own desktop OAuth flow. Instead, the server requests the Gmail scope when you sign in, and a sync script copies those tokens to the path the MCP reads. That avoids `redirect_uri_mismatch` and the repeated “Access blocked” popup that happened when the MCP tried to open its own auth (with a random localhost port not registered in Google Cloud).

---

## 1. Google Cloud / Gmail API setup

Use the **admin panel dev testing email** for the MCP mailbox. In code this is **`ADMIN_DEV_TESTING_EMAIL`** in [server/src/routes/internal/appointments/appointmentConstants.ts](../server/src/routes/internal/appointments/appointmentConstants.ts) (same as `DEFAULT_CALENDAR_EMAIL`). You can **reuse the existing Google Cloud project and OAuth client** used for Calendar; only add Gmail API and the Gmail scope below.

1. **Reuse the existing Google Cloud project**  
   Use the same project as your Calendar API. [APIs & Services](https://console.cloud.google.com/apis).

2. **Enable Gmail API**  
   [APIs & Services → Library](https://console.cloud.google.com/apis/library) → search “Gmail API” → Enable.

3. **Configure OAuth consent screen**  
   [APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).  
   - Type: **External** (we are not publishing the app).  
   - Add the admin dev testing email (`ADMIN_DEV_TESTING_EMAIL` in `appointmentConstants.ts`; currently `scheduling@districthomepro.com`) as a **Test user** (if not already).  
   - Scopes: add `https://www.googleapis.com/auth/gmail.modify` (read + mark read).

4. **Use your existing OAuth Client ID**  
   Keep using the **same** OAuth client as Calendar (the one in server `.env` with `GOOGLE_REDIRECT_URI`). No separate “Desktop app” client or extra redirect URIs are needed; the Gmail MCP uses tokens obtained via the server’s web OAuth flow.

---

## 2. Creds and tokens (same OAuth as Calendar)

Your server already has `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`. The server’s default scopes now include `gmail.modify` (see [server/src/config/googleOAuth.ts](../server/src/config/googleOAuth.ts)), so when you complete OAuth via the server (Calendar auth URL), you get both Calendar and Gmail scopes.

1. **Gmail MCP client file** (for the Python MCP to read client id/secret):  
   From the **server** directory run:
   ```bash
   cd server
   npm run gmail-mcp:creds
   ```
   This writes `~/.cursor/gmail-mcp/client_creds.json`.

2. **Token file** (so the MCP doesn’t open its own OAuth):  
   After you’ve done **Calendar OAuth at least once** (and preferably re-auth once so the token includes the new Gmail scope), sync the server’s tokens to the path the MCP uses:
   ```bash
   cd server
   npm run gmail-mcp:sync-tokens
   ```
   This reads `server/.google-tokens.json` and writes `~/.cursor/gmail-mcp/tokens.json` in the format the Gmail MCP expects. No browser, no redirect_uri_mismatch.

3. Add the Gmail server to **`~/.cursor/mcp.json`** (section 5). Cursor uses that file, not a project-level mcp.json.

---

## 3. Credential and token location (outside repo)

Keep all secrets outside the repo. Recommended layout:

| What              | Recommended path (replace `$HOME` with your home directory) |
|-------------------|-------------------------------------------------------------|
| OAuth client JSON | `$HOME/.cursor/gmail-mcp/client_creds.json`                   |
| Token file        | `$HOME/.cursor/gmail-mcp/tokens.json`                       |
| Gmail MCP clone   | `$HOME/.cursor/gmail-mcp-server` (clone of the repo)        |

These paths are already listed in [.gitignore](.gitignore) (or equivalent) so they are never committed. See “Keep credentials outside repo” in .cursor/README.md (Secrets and credentials).

---

## 4. Install uv and MCP server path

1. **Install uv** (required by the Gmail MCP):  
   https://docs.astral.sh/uv/

2. **Gmail MCP code** – use the project submodule (clones get it via `git submodule update --init --recursive`):
   - Path: `<project-root>/.cursor/gmail-mcp-server`
   - Or your own clone: `git clone https://github.com/jasonsum/gmail-mcp-server.git "$HOME/.cursor/gmail-mcp-server"`.
   Use that path for `--directory` in the MCP config (section 5).

3. **No separate OAuth in the MCP**  
   If `tokens.json` exists and has a valid `refresh_token`, the MCP uses it and never opens a browser. You create that file by running `npm run gmail-mcp:sync-tokens` (section 2). If you see “Access blocked: redirect_uri_mismatch”, sync tokens (section 2) and restart Cursor. If you see **`RefreshError: invalid_scope`** or **403 insufficientPermissions / insufficient authentication scopes**, your server token was issued before the Gmail scope was added. Do the **Re-auth for Gmail scope** steps below, then sync and restart Cursor.

**Re-auth for Gmail scope (fix 403 insufficientPermissions)**  
If the MCP crashes with “insufficient authentication scopes” or 403, the token in `server/.google-tokens.json` was created before the server requested the Gmail scope. Get a new token that includes Gmail:

1. Start the server (e.g. `cd server && npm run dev`).
2. In a browser, open: **`http://localhost:3001/api/v1/external/oauth`** (use your server port if different).
3. Sign in with the admin dev testing email (e.g. `scheduling@districthomepro.com`). Approve the requested access (Calendar + Gmail).
4. After the redirect back to the server, the new tokens are saved to `server/.google-tokens.json`.
5. Run: `cd server && npm run gmail-mcp:sync-tokens`.
6. Restart Cursor.

4. **Verify**  
   Run the MCP manually once to confirm it can list mail (no browser should open):
   ```bash
   cd "<project-root>/.cursor/gmail-mcp-server"
   uv run gmail --creds-file-path "$HOME/.cursor/gmail-mcp/client_creds.json" --token-path "$HOME/.cursor/gmail-mcp/tokens.json"
   ```
   Or use [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) and call `get-unread-emails` (see the [Gmail MCP README](https://github.com/jasonsum/gmail-mcp-server)).

---

## 5. Register the MCP in Cursor

Cursor reads MCP config from your **user config file**, not from the project. Add the Gmail server to **`~/.cursor/mcp.json`** (merge into the existing `mcpServers` object if you already have other servers).

Use the server entry from [.cursor/mcp.json.example](mcp.json.example): copy that server block into `~/.cursor/mcp.json` and replace the three paths with your actual paths:

| Placeholder | Replace with |
|-------------|--------------|
| `REPLACE_WITH_PATH_TO_GMAIL_MCP_CLONE` | Project submodule: `/Users/.../Differential_Scheduler/.cursor/gmail-mcp-server` (or your clone path) |
| `REPLACE_WITH_PATH_TO_CREDENTIALS_JSON` | `$HOME/.cursor/gmail-mcp/client_creds.json` |
| `REPLACE_WITH_PATH_TO_TOKENS_JSON` | `$HOME/.cursor/gmail-mcp/tokens.json` |

Restart Cursor so it loads the new server.

---

## 6. Which mailbox is used

The mailbox the MCP reads is the **admin panel dev testing email**, defined in code as **`ADMIN_DEV_TESTING_EMAIL`** in [server/src/routes/internal/appointments/appointmentConstants.ts](../server/src/routes/internal/appointments/appointmentConstants.ts) (same value as `DEFAULT_CALENDAR_EMAIL`). Calendar invite replies from the app land in that inbox. The MCP only needs read access to it.

---

## 7. Example prompts (invite-response verification)

After the MCP is enabled, you can ask the Cursor AI things like:

- “Check the scheduler inbox for replies to calendar invites from the last 24 hours.”
- “List unread emails in the inbox that might be calendar responses.”
- “Search for emails with subject containing ‘Inspection’ or ‘Appointment’ from the last 48 hours.”

The agent will use the Gmail MCP tools (`get-unread-emails`, `read-email`, or search) and report what’s there. If you expect a response and none appears, that can indicate a problem in the invite pipeline (send, delivery, or reply not yet received).
