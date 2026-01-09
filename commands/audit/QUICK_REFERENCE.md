# Audit Commands Quick Reference

## Atomic Commands

| Command | Purpose | Input | Output |
|---------|---------|-------|--------|
| `auditComments` | Check comment format and content | tier, identifier, featureName, modifiedFiles | AuditResult |
| `auditPlanning` | Evaluate planning outcomes | tier, identifier, featureName | AuditResult (skip for task) |
| `auditTodos` | Verify todo creation and propagation | tier, identifier, featureName | AuditResult |
| `auditSecurity` | Check security standards compliance | tier, identifier, featureName, modifiedFiles | AuditResult |
| `auditCheckpoints` | Verify checkpoint documentation | tier, identifier, featureName | AuditResult |
| `auditTests` | Check test content and coverage | tier, identifier, featureName, testResults | AuditResult |
| `auditDocs` | Evaluate guide/log/handover quality | tier, identifier, featureName | AuditResult (skip for task) |
| `auditVueArchitecture` | Check Vue architecture consistency | tier, identifier, featureName | AuditResult |
| `auditCodeQuality` | Run deterministic code quality audits | tier, identifier, featureName | AuditResult |

## Composite Commands

| Command | Purpose | Audits Run | Input | Output |
|---------|---------|------------|-------|--------|
| `auditSession` | All audits for session | 9 audits (includes code quality) | sessionId, featureName, modifiedFiles?, testResults? | TierAuditResult + report |
| `auditPhase` | All audits for phase | 9 audits (includes code quality) | phase, featureName, modifiedFiles?, testResults? | TierAuditResult + report |
| `auditFeature` | All audits for feature | 9 audits (includes code quality) | featureName, modifiedFiles?, testResults? | TierAuditResult + report |
| `auditTask` | Selected audits for task | 6 audits (excludes planning, docs, code quality) | taskId, featureName, modifiedFiles?, testResults? | TierAuditResult + report |

## Integration Points

| End Command | Calls | When |
|-------------|-------|------|
| `/session-end` | `/audit-session` | After all steps complete (non-blocking) |
| `/phase-end` | `/audit-phase` | After all steps complete (non-blocking) |
| `/feature-end` | `/audit-feature` | After all steps complete (non-blocking) |
| `/task-end` | `/audit-task` | After task completion (non-blocking) |

## Audit Status Levels

- **pass** ✅ - All checks passed
- **warn** ⚠️ - Some warnings, but acceptable
- **fail** ❌ - Critical issues found

## Report Locations

Reports are written to:
```
.cursor/project-manager/features/[feature]/audits/[tier]-[id]-audit.md
```

Examples:
- `session-1.3-audit.md`
- `phase-1-audit.md`
- `feature-vue-migration-audit.md`
- `task-1.3.1-audit.md`

## Common Usage

```bash
# Manual audit commands
/audit-session 1.3 vue-migration
/audit-phase 1 vue-migration
/audit-feature vue-migration
/audit-task 1.3.1 vue-migration

# Audits run automatically at end of workflows
/session-end 1.3 "Description" 1.4
/phase-end 1
/feature-end vue-migration
/task-end 1.3.1
```

