# Gmail MCP setup for invite-response verification

This MCP lets the Cursor AI read the mailbox that receives calendar invite responses (accept/decline/tentative) so you can verify the invite pipeline is working.

**Decision:** Use **Gmail MCP** (Option A from the plan). The mailbox that receives invite replies is the Gmail inbox of the Google account that owns the calendar (same account used for Calendar OAuth). Server: [jasonsum/gmail-mcp-server](https://github.com/jasonsum/gmail-mcp-server).

---

## 1. Google Cloud / Gmail API setup

Use the **admin panel dev testing email** for the MCP mailbox. In code this is **`ADMIN_DEV_TESTING_EMAIL`** in [server/src/routes/internal/appointments/appointmentConstants.ts](../server/src/routes/internal/appointments/appointmentConstants.ts) (same as `DEFAULT_CALENDAR_EMAIL`). You can **reuse the existing Google Cloud project** used for Calendar (and other Google APIs); only add Gmail API, the Gmail scope, and the test user as below.

1. **Reuse the existing Google Cloud project**  
   Use the same project as your Calendar API. [APIs & Services](https://console.cloud.google.com/apis).

2. **Enable Gmail API**  
   [APIs & Services → Library](https://console.cloud.google.com/apis/library) → search “Gmail API” → Enable.

3. **Configure OAuth consent screen**  
   [APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).  
   - Type: **External** (we are not publishing the app).  
   - Add the admin dev testing email (`ADMIN_DEV_TESTING_EMAIL` in `appointmentConstants.ts`; currently `scheduling@districthomepro.com`) as a **Test user** (if not already).  
   - Scopes: add `https://www.googleapis.com/auth/gmail.modify` (read + mark read).

4. **Create or reuse OAuth Client ID**  
   [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) → Create Credentials → OAuth client ID (or reuse an existing Desktop app client and add the Gmail scope).  
   - Application type: **Desktop app**.  
   - Use your **existing** OAuth client (the one in server `.env`). Generate the credentials file from .env in section 2 (see “Credential and token location” below).

---

## 2. Use existing .env for MCP credentials

Your server `.env` already has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Generate the Gmail MCP credentials file from them. From the **server** directory:

```bash
cd server
npm run gmail-mcp:creds
```

This reads `server/.env.development` and writes `~/.cursor/gmail-mcp/client_creds.json` (creating the directory if needed). Then run the Gmail MCP once (section 4) to complete OAuth and create the token file; point Cursor at those paths in section 5.

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

## 4. Install and run the MCP server

1. **Install uv** (recommended by the Gmail MCP):  
   https://docs.astral.sh/uv/

2. **Clone the Gmail MCP repo** (or use the project copy). Either:
   - In project: `git clone https://github.com/jasonsum/gmail-mcp-server.git .cursor/gmail-mcp-server` (already done; `.cursor/gmail-mcp-server` is gitignored).
   - Or in home: `git clone https://github.com/jasonsum/gmail-mcp-server.git "$HOME/.cursor/gmail-mcp-server"`.
   Use the same path in `.cursor/mcp.json` for `--directory`.

3. **First-time auth**  
   When the MCP runs, it will open a browser for OAuth. Sign in with the **admin panel dev testing email** (see `ADMIN_DEV_TESTING_EMAIL` in `appointmentConstants.ts`). Tokens will be written to the path you set as `--token-path`.

4. **Verify**  
   Run the server manually once to confirm it can list/read mail:
   ```bash
   cd "$HOME/.cursor/gmail-mcp-server"
   uv run gmail --creds-file-path "$HOME/.cursor/gmail-mcp/client_creds.json" --token-path "$HOME/.cursor/gmail-mcp/tokens.json"
   ```
   Or use [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) and call `get-unread-emails` (see the [Gmail MCP README](https://github.com/jasonsum/gmail-mcp-server)).

---

## 5. Register the MCP in Cursor

- **Project-level (recommended):** Copy [.cursor/mcp.json.example](mcp.json.example) to `.cursor/mcp.json`. Edit `.cursor/mcp.json` and replace the three placeholder paths with your actual paths (creds file, token file, and clone directory). Restart Cursor so it picks up the MCP.
- **Or:** Cursor Settings → Features → MCP → Add server. Use the same `command` and `args` as in the example (with your paths).

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
