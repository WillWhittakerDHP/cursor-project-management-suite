# Phase [N] Guide Template

**Purpose:** Phase-level guide for planning and tracking major milestones

**Tier:** Phase (Tier 1 - High-Level)

---

## Phase Overview

**Phase Number:** [N]
**Phase Name:** [Name]
**Description:** [Brief description of phase objectives]

**Duration:** [Estimated weeks/months]
**Status:** [Not Started / In Progress / Complete]

---

## Phase Objectives

- [Objective 1]
- [Objective 2]
- [Objective 3]

---

## Sessions Breakdown

- [ ] ### Session [SESSION_ID]: [SESSION_NAME]
**Description:** [What this session accomplishes]
**Tasks:** [Number of tasks]
**Learning Goals:**
- [Learning goal 1]
- [Learning goal 2]

- [ ] ### Session [SESSION_ID+1]: [SESSION_NAME]
**Description:** [What this session accomplishes]
**Tasks:** [Number of tasks]
**Learning Goals:**
- [Learning goal 1]
- [Learning goal 2]

---

## Dependencies

**Prerequisites:**
- [Dependency 1]
- [Dependency 2]

**Downstream Impact:**
- [How this phase affects later phases]

---

## Success Criteria

- [ ] All sessions completed
- [ ] All learning goals achieved
- [ ] Code quality checks passing
- [ ] Documentation updated
- [ ] Ready for next phase

---

## End of Phase Workflow

**CRITICAL: Prompt before completing phase**

After completing all sessions in a phase, **prompt the user** before running `/phase-end`:

```
## Ready to Complete Phase?

All sessions complete. Ready to run phase-completion workflow?

**This will:**
- Mark phase complete (update checkboxes and status)
- Update phase log with completion summary
- Update main handoff document
- Git commit/push

**Proceed with /phase-end?** (yes/no)
```

**If user says "yes":**
- Run `/phase-end` command automatically
- Complete all phase-completion steps

**If user says "no":**
- Address any requested changes
- Re-prompt when ready

After completing all sessions in a phase:

1. **Verify phase completion** - All sessions complete, success criteria met
2. **Update phase status** - Mark phase as Complete
3. **Update phase handoff** - Document phase completion and transition context
4. **Workflow Feedback** (Optional - only if issues encountered):
   - Were there any problems managing this phase workflow or issues with results?
   - Note any sticking points, inefficiencies, or workflow friction for future improvement
   - Consider if phase-level issues suggest improvements needed at session or task level

---

## Notes

[Phase-specific notes, decisions, blockers]

---

## Related Documents

- Phase Log: `.cursor/workflow-manager/vue-migration/phases/phase-[N]-log.md`
- Phase Handoff: `.cursor/workflow-manager/vue-migration/phases/phase-[N]-handoff.md`
- Session Guides: `.cursor/workflow-manager/vue-migration/sessions/session-[X.Y]-guide.md`

