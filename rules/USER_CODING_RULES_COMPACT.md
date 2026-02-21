---
alwaysApply: true
---

# User Coding Rules - Compact Format for Settings Tab

Personal preferences, communication style, learning-focused rules, and workflow preferences.

## COMMUNICATION PREFERENCE

I am new to coding, so use best practice strategies and architectures that you explicitly describe with professional naming and explicit descriptions, delivered in a supportive tone. Explain architectural decisions and patterns clearly.

## LEARNING-FOCUSED RULES

Add explanatory comments for complex patterns, new concepts, and framework transitions using these patterns: LEARNING (new concepts), WHY (rationale), COMPARISON (React vs Vue.js), PATTERN (architectural patterns), RESOURCE (learning links). See: LEARNING_STRATEGIES.md for comment patterns.

Identify natural learning checkpoints after component creation, pattern introduction, complex logic, or integration. Provide optional explanations without disrupting flow. Use checkpoint questions: What, Why, How, When, Where.

Explain architectural decisions and why patterns were chosen. Compare alternatives considered. Link to learning resources. When introducing new patterns, explain how they relate to existing codebase patterns. See: AGENTIC_AI_APPROACHES.md for pattern connection strategies.

Start simple, add complexity gradually. Explain each layer as it's added. Document the learning progression from basic working code to type safety, validation, and error handling. See: LEARNING_STRATEGIES.md for examples of progressive complexity.

Encourage experimentation and understanding. After implementing code, suggest modifications to try, related concepts to explore, and practice opportunities. Explain trade-offs in decisions. Connect new code to existing patterns. See: LEARNING_STRATEGIES.md for active learning techniques.

## SESSION WORKFLOW RULES

Follow the session guide structure for all coding sessions. Before starting: label the session (format: `## Session: [Phase].[Sub-Phase] - [Brief Description]`), review previous session notes, set learning goals, identify files to work with. During session: work on one sub-session at a time, pause between sub-sessions for learning checkpoints, document decisions inline. After each sub-session: verify checkpoint (tests pass, types compile), review learning, update progress. End of session checklist (required): 1) Verify app starts - run appropriate start command (e.g., `npm run start:dev`) to confirm application launches without errors, 2) Run linting - execute linting commands (`cd client-vue && npm run lint` for Vue, `cd client && npm run lint` for React, `cd server && npm run lint` for server) and fix any errors, 3) Update session log - add entry to session log document (e.g., `VUE_MIGRATION_SESSION_LOG.md`) with sub-session details, framework differences, learning checkpoints, questions answered, next sub-session, session status, 4) Update handoff document - update handoff document (e.g., `VUE_MIGRATION_HANDOFF.md`) with phase status updates, sub-session section (Goal, Source/Target Files, Key Features, Important Notes, Architecture Notes, Completion Summary), update "Next Action" and "Last Updated" timestamp, 5) Commit and push to git - commit changes with descriptive messages and push to appropriate branch, 6) Agent hand-off check - determine if continuing with same agent or switching, create compact prompt in format: `@[HANDOFF_DOCUMENT] Continue [project] - start Sub-Session [X.Y.Z] ([Description])`. See: VUE_MIGRATION_SESSION_GUIDE.md, VUE_MIGRATION_SESSION_LOG.md, VUE_MIGRATION_HANDOFF.md. Applies to all coding sessions, especially multi-session projects. Exception: Quick fixes or single-file changes may skip full session structure but should still verify app starts and linting passes.

## WORKFLOW MODE RULES

All slash commands for planning and documentation must be used in Ask Mode. Implementation only happens in Agent Mode after explicit approval. Planning commands (`/session-start`, `/session-change`, `/plan-task`, `/plan-session`, `/plan-phase`, etc.) output plans and documentation, not implementations. Before switching to Agent Mode, agents MUST show clear summary of what will be implemented, list files that will be created/modified, show implementation plan with steps, and prompt for approval: "Ready to implement these changes? Switch to agent mode to proceed." (yes/no). See: `.cursor/rules/USER_CODING_RULES.md` (Rule 23) for complete Ask Mode vs Agent Mode workflow guidelines.

Before implementing ANY code changes (bug fixes, refactoring, feature additions), MUST: 1) Run tier-appropriate checkpoint command (`/session-checkpoint`, `/phase-checkpoint`, `/feature-checkpoint`) to document current state, 2) Run tier-appropriate change command (`/session-change`, `/phase-change`, `/feature-change`) to create change request entry, 3) Then implement changes after change request is documented. No exceptions - applies to all changes regardless of size or complexity. See: `.cursor/rules/USER_CODING_RULES.md` (Rule 24) for complete tier-appropriate change command workflow.

