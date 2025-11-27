# Approval Prompt Template

**Purpose:** Standardized format for approval prompts before switching to Agent Mode for implementation

**Reference:** Rule 23 in `.cursor/rules/USER_CODING_RULES.md`

---

## Standard Approval Prompt Format

When agents need to switch from Ask Mode to Agent Mode for implementation, they MUST show an approval prompt using this format:

```
## Ready to Implement?

**What will be changed:**
- `[file-path]` - [Brief description of what will change]
- `[file-path]` - [Brief description of what will change]

**Files to be created:**
- `[file-path]` - [Brief description]

**Files to be modified:**
- `[file-path]` - [Brief description of changes]

**Implementation Plan:**
1. [Step 1 - specific and actionable]
2. [Step 2 - specific and actionable]
3. [Step 3 - specific and actionable]

**Ready to implement these changes? Switch to agent mode to proceed.** (yes/no)
```

---

## Guidelines

### ✅ DO:

1. **Be specific** - List exact files that will be created/modified
2. **Show what changes** - Brief description of what will change in each file
3. **Clear steps** - Numbered implementation plan with specific actions
4. **Explicit approval** - Always end with: "Ready to implement these changes? Switch to agent mode to proceed." (yes/no)
5. **Wait for approval** - Do NOT proceed until user explicitly says "yes"

### ❌ DON'T:

- Vague file lists (e.g., "some files will be modified")
- Unclear changes (e.g., "update code")
- Missing implementation plan
- Proceeding without explicit approval
- Switching to Agent Mode automatically

---

## Examples

### Example 1: Session Start Approval

```
## Ready to Implement?

**What will be changed:**
- `client-vue/src/stores/globalStore.ts` - Create new Pinia store with getGlobalEntities and getGlobalRelationship methods
- `client-vue/src/composables/useGlobalData.ts` - Create composable wrapping globalStore

**Files to be created:**
- `client-vue/src/stores/globalStore.ts` - Pinia store for global data
- `client-vue/src/composables/useGlobalData.ts` - Composable for global data access

**Implementation Plan:**
1. Create globalStore.ts with Pinia defineStore setup syntax
2. Implement getGlobalEntities and getGlobalRelationship getters
3. Create useGlobalData composable that wraps globalStore
4. Export composable for use in components
5. Verify store compiles and types are correct

**Ready to implement these changes? Switch to agent mode to proceed.** (yes/no)
```

### Example 2: Change Request Approval

```
## Ready to Implement?

**What will be changed:**
- `client-vue/src/stores/globalStore.ts` - Rename getChildrenOf to getGlobalRelationship
- `client-vue/src/composables/useGlobalData.ts` - Update method name reference
- All files importing/using getChildrenOf

**Files to be modified:**
- `client-vue/src/stores/globalStore.ts` - Method rename
- `client-vue/src/composables/useGlobalData.ts` - Update import/usage
- [Other files found containing getChildrenOf]

**Implementation Plan:**
1. Search codebase for all occurrences of `getChildrenOf`
2. Update function/method names to `getGlobalRelationship`
3. Update all imports and usages
4. Update session log with change request entry
5. Verify no breaking changes

**Ready to implement these changes? Switch to agent mode to proceed.** (yes/no)
```

---

## When to Show Approval Prompt

Show approval prompt when:

1. **After planning commands** - After `/session-start`, `/plan-task`, etc. output a plan
2. **Before implementation** - Before making any code changes
3. **After change requests** - After `/session-change` generates an action plan
4. **Before file operations** - Before creating/modifying files
5. **Before git operations** - Before committing/pushing (if not part of session-end workflow)

**Do NOT show approval prompt for:**
- Read-only commands (`/read-handoff`, `/read-guide`, `/status`)
- Commands that only update documentation (these are Ask Mode operations)

---

## User Response Handling

**If user says "yes":**
- User switches to Agent Mode
- Agent begins implementation immediately
- Follow the implementation plan step by step

**If user says "no":**
- Address any concerns or requested changes
- Update the plan if needed
- Re-prompt when ready

**If user asks questions:**
- Answer questions thoroughly
- Update plan if needed based on answers
- Re-prompt when ready

---

## Related Documents

- Rule 23: `.cursor/rules/USER_CODING_RULES.md` (Ask Mode vs Agent Mode Workflow)
- Session Start Template: `.cursor/commands/tiers/session/templates/session-start-response-template.md`
- Command Usage: `.cursor/commands/USAGE.md`

