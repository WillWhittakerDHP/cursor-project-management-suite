# Session [SESSION_ID] Handoff: [DESCRIPTION]

**Purpose:** Minimal transition context between sessions (~100-200 lines)

**Tier:** Session (Tier 2 - Medium-Level)

**Last Updated:** [Date]
**Session Status:** [Complete / In Progress]
**Next Session:** [NEXT_SESSION]

---

## Current Status

**Last Completed:** Task [LAST_TASK]
**Next Session:** Session [NEXT_SESSION]
**Git Branch:** `branch-name`
**Last Updated:** [Date]

---

## Next Action

Start Session [NEXT_SESSION]

---

## Transition Context

**Where we left off:**
[Minimal notes about what was completed - 2-3 sentences max]

**What you need to start:**
- [Brief bullet point about context needed]
- [Brief bullet point about files to review]
- [Brief bullet point about any blockers or considerations]

**Minimal Future Considerations:**
- [Only include if critical for next session - keep minimal]

---

## Document Structure Guidelines

### Keep Minimal:
- Transition context only (where we left off, what's next)
- Format/template for handoff entries
- Critical context for starting next session

### Move to Session Guide:
- Explicit instructions
- Editing advice
- Architectural notes
- Code-reuse suggestions
- Detailed task notes
- Learning checkpoints
- Pattern explanations

### File Size Target:
- 100-200 lines maximum
- Focus on transition, not history
- Remove completed task details after they're no longer needed

---

## Example Minimal Entry

```markdown
## Transition Context

**Where we left off:**
Completed Task 1.3.4: Relationship API Composables. Created composables for parent-child CRUD operations. All files compile successfully.

**What you need to start:**
- Review `frontend-root/src/api/relationships.ts` for relationship patterns
- Begin Session 1.4: Transformers
- Follow patterns from `frontend-root/src/admin/dataTransformation/` (React reference)
```

---

## Maintenance

- Update "Last Completed" and "Next Session" after each session
- Keep "Transition Context" to 2-3 sentences
- Remove old task details once they're no longer needed
- Move detailed notes to session log or session guide

---

## Related Documents

- Session Guide: `.cursor/project-manager/features/vue-migration/sessions/session-[SESSION_ID]-guide.md` (detailed instructions and patterns)
- Session Log: `.cursor/project-manager/features/vue-migration/sessions/session-[SESSION_ID]-log.md`
- Phase Handoff: `.cursor/project-manager/features/vue-migration/phases/phase-[PHASE]-handoff.md` (for phase-level context)

