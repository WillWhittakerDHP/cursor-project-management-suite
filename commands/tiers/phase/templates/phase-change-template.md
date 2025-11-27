# Phase Change Documentation

**From Phase:** [N]  
**To Phase:** [M]  
**Date:** [YYYY-MM-DD]  
**Reason:** [Brief description of why the phase change is necessary]

## Context

### Current Phase State

**Phase [N] Status:**
- [ ] Phase guide created
- [ ] Phase log started
- [ ] Phase handoff document exists
- [ ] Current session: [X.Y]
- [ ] Current task: [X.Y.Z]

**Key Accomplishments:**
- [List key accomplishments from current phase]

**Incomplete Work:**
- [List incomplete work that will be carried forward]

**Decisions Made:**
- [List important architectural or design decisions]

### Reason for Phase Change

[Detailed explanation of why the phase change is necessary. Include:]
- What was discovered during implementation
- Why the current approach is not appropriate
- What the new approach will be
- How this affects the overall project

**Example:**
> While implementing the vuexy wizard pattern for the booking scheduler, we discovered that the vuexy pattern's assumptions about form structure don't align with our differential scheduling requirements. The wizard needs to handle multiple parallel scheduling paths, which requires a different architectural approach. We're pivoting to a custom wizard implementation that better supports our specific use case.

## Transition Plan

### Phase [N] Closure

**Actions Required:**
1. [ ] Document current state in phase [N] log
2. [ ] Update phase [N] handoff with incomplete work
3. [ ] Create checkpoint of current codebase state
4. [ ] Archive phase [N] documentation

**Checkpoint Details:**
- Git commit/branch: [commit hash or branch name]
- Code state: [description of current code state]
- Test status: [passing/failing/partial]

### Phase [M] Initialization

**Actions Required:**
1. [ ] Create phase [M] guide document
2. [ ] Initialize phase [M] log
3. [ ] Create phase [M] handoff document
4. [ ] Set up new phase structure

**Phase [M] Objectives:**
- [List objectives for the new phase]

**Phase [M] Scope:**
- [Define what will be included in the new phase]

## Impact Assessment

### Code Changes Required

- [List major code changes needed]
- [List refactoring required]
- [List new components/modules to create]

### Documentation Updates

- [List documentation that needs updating]
- [List new documentation to create]

### Testing Impact

- [List tests that need updating]
- [List new tests required]
- [List tests that may no longer be relevant]

## Risk Mitigation

### Potential Risks

1. **Risk:** [Description]
   - **Mitigation:** [How to mitigate]

2. **Risk:** [Description]
   - **Mitigation:** [How to mitigate]

### Rollback Plan

If the phase change proves unsuccessful:
- [Steps to rollback to phase [N]]
- [How to restore previous state]
- [How to resume previous approach]

## Timeline

**Estimated Duration:** [X days/weeks]

**Milestones:**
- [ ] Phase [N] closure complete
- [ ] Phase [M] initialization complete
- [ ] First session of phase [M] started
- [ ] Phase change validated

## Notes

[Any additional notes, concerns, or considerations]

## Related Documents

- Phase [N] Guide: `.cursor/workflow-manager/vue-migration/phases/phase-[N]-guide.md`
- Phase [N] Log: `.cursor/workflow-manager/vue-migration/phases/phase-[N]-log.md`
- Phase [N] Handoff: `.cursor/workflow-manager/vue-migration/phases/phase-[N]-handoff.md`
- Phase [M] Guide: `.cursor/workflow-manager/vue-migration/phases/phase-[M]-guide.md`
- Phase [M] Log: `.cursor/workflow-manager/vue-migration/phases/phase-[M]-log.md`
- Phase [M] Handoff: `.cursor/workflow-manager/vue-migration/phases/phase-[M]-handoff.md`

