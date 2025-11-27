# Feature [Name] Guide

**Purpose:** Feature-level guide for planning and tracking major initiatives

**Tier:** Feature (Tier 0 - Highest Level)

---

## Feature Overview

**Feature Name:** [Name]
**Description:** [Brief description of feature objectives]
**Status:** [Not Started / Research / Planning / In Progress / Complete]

**Duration:** [Estimated weeks/months]
**Started:** [Date]
**Completed:** [Date] (if complete)

---

## Research Phase

**Status:** [Not Started / In Progress / Complete]

### Research Findings

[Summary of research findings - see research question template for details]

**Key Decisions:**
- [Decision 1]
- [Decision 2]
- [Decision 3]

**Technology Choices:**
- [Technology 1] - [Rationale]
- [Technology 2] - [Rationale]

**Architecture:**
[High-level architecture description]

**Risks Identified:**
- [Risk 1] - [Mitigation]
- [Risk 2] - [Mitigation]

**Research Documentation:**
- Research Questions: `.cursor/workflow-manager/features/[name]/research-questions.md`
- External Research: [Links to research sources]

---

## Feature Objectives

- [Objective 1]
- [Objective 2]
- [Objective 3]

---

## Phases Breakdown

- [ ] ### Phase [N]: [Phase Name]
**Description:** [What this phase accomplishes]
**Duration:** [Estimated weeks]
**Sessions:** [Number of sessions]
**Dependencies:** [Prerequisites]
**Success Criteria:**
- [Criterion 1]
- [Criterion 2]

- [ ] ### Phase [N+1]: [Phase Name]
**Description:** [What this phase accomplishes]
**Duration:** [Estimated weeks]
**Sessions:** [Number of sessions]
**Dependencies:** [Prerequisites]
**Success Criteria:**
- [Criterion 1]
- [Criterion 2]

---

## Dependencies

**Prerequisites:**
- [Dependency 1]
- [Dependency 2]

**Downstream Impact:**
- [How this feature affects other features/work]

**External Dependencies:**
- [External dependency 1]
- [External dependency 2]

---

## Success Criteria

- [ ] All phases completed
- [ ] All research questions answered
- [ ] Architecture decisions documented
- [ ] Code quality checks passing
- [ ] Documentation updated
- [ ] Tests passing
- [ ] Performance targets met
- [ ] Ready for production

---

## Git Branch Strategy

**Branch Name:** `feature/[name]`
**Branch From:** `develop`
**Merge To:** `develop`

**Branch Management:**
- Created: [Date] (at feature start)
- Merged: [Date] (at feature end)
- Deleted: [Date] (after merge)

---

## End of Feature Workflow

**CRITICAL: Prompt before ending feature**

After completing all phases in a feature, **prompt the user** before running `/feature-end`:

```
## Ready to End Feature?

All phases complete. Ready to merge feature branch?

**This will:**
- Generate feature summary
- Merge feature/[name] → develop
- Delete feature branch
- Finalize documentation

**Proceed with /feature-end?** (yes/no)
```

**If user says "yes":**
- Run `/feature-end` command automatically
- Complete all feature-end steps

**If user says "no":**
- Address any requested changes
- Re-prompt when ready

After completing all phases in a feature:

1. **Verify feature completion** - All phases complete, success criteria met
2. **Update feature status** - Mark feature as Complete
3. **Update feature handoff** - Document feature completion and transition context
4. **Generate feature summary** - Create completion summary
5. **Merge feature branch** - Merge to develop (after approval)
6. **Delete feature branch** - Clean up branch (after merge)
7. **Workflow Feedback** (Optional - only if issues encountered):
   - Were there any problems managing this feature workflow or issues with results?
   - Note any sticking points, inefficiencies, or workflow friction for future improvement
   - Consider if feature-level issues suggest improvements needed at phase, session, or task level

---

## Notes

[Feature-specific notes, decisions, blockers]

---

## Related Documents

- Feature Log: `.cursor/workflow-manager/features/[name]/feature-[name]-log.md`
- Feature Handoff: `.cursor/workflow-manager/features/[name]/feature-[name]-handoff.md`
- Phase Guides: `.cursor/workflow-manager/features/[name]/phases/phase-[N]-guide.md`
- Research Questions: `.cursor/workflow-manager/features/[name]/research-questions.md`

