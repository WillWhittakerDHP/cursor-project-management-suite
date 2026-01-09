# Audit Commands

This directory contains slash commands for auditing workflow outcomes against quality standards. The audit system evaluates adherence to comment format and content, planning outcomes, todos and todo propagation, security standards, checkpoints, test content, and documentation quality.

## Overview

Audit commands are organized into **atomic** (single-responsibility) and **composite** (multi-step workflows) operations. All commands follow the existing command pattern and can be called programmatically or via slash commands.

## Quick Reference

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for a one-page lookup table.

## Command Categories

### Atomic Commands

Each audit category has its own atomic command:

- `auditComments` - Check comment format and content adherence
- `auditPlanning` - Evaluate planning outcomes and document quality
- `auditTodos` - Verify todo creation and propagation across tiers
- `auditSecurity` - Check security standards compliance
- `auditCheckpoints` - Verify checkpoint documentation
- `auditTests` - Check test content (if created, if not, why)
- `auditDocs` - Evaluate guide, log, and handover document quality
- `auditVueArchitecture` - Check Vue component/composable boundaries
- `auditCodeQuality` - Run deterministic code quality audits (duplication, hardcoding, typecheck, etc.)

### Composite Commands

Tier-specific composite commands run all relevant audits:

- `auditSession` - All 9 audits for session tier (includes code quality)
- `auditPhase` - All 9 audits for phase tier (includes code quality)
- `auditFeature` - All 9 audits for feature tier (includes code quality)
- `auditTask` - 6 audits for task tier (excludes planning, docs, code quality)

## Usage Examples

### Programmatic Usage

```typescript
import { auditSession, auditPhase, auditFeature, auditTask } from './cursor/commands/audit';

// Audit a session
const sessionAudit = await auditSession({
  sessionId: '1.3',
  featureName: 'vue-migration',
  modifiedFiles: ['client/src/composables/useEntity.ts'],
  testResults: { success: true, coverage: 85 }
});

// Audit a phase
const phaseAudit = await auditPhase({
  phase: '1',
  featureName: 'vue-migration'
});

// Audit a feature
const featureAudit = await auditFeature({
  featureName: 'vue-migration'
});

// Audit a task
const taskAudit = await auditTask({
  taskId: '1.3.1',
  featureName: 'vue-migration',
  modifiedFiles: ['client/src/composables/useEntity.ts']
});
```

### Slash Command Usage

Commands can be invoked via slash commands (if configured in your environment):
- `/audit-session 1.3 vue-migration`
- `/audit-phase 1 vue-migration`
- `/audit-feature vue-migration`
- `/audit-task 1.3.1 vue-migration`

## Integration with End Commands

Audits are automatically called at the end of workflow completion:

- `/session-end` → calls `/audit-session` (non-blocking)
- `/phase-end` → calls `/audit-phase` (non-blocking)
- `/feature-end` → calls `/audit-feature` (non-blocking)
- `/task-end` → calls `/audit-task` (non-blocking)

Audit failures are logged but do not prevent workflow completion. Review audit reports to refine workflow processes.

## Audit Categories

### Comments Audit

Checks:
- Comment format compliance (LEARNING, WHY, PATTERN, etc.)
- Strategic placement (per STRATEGIC_PLACEMENT_GUIDE.md)
- Comment density (not too sparse, not too dense)
- Framework transition comments (React → Vue)

### Planning Audit

Checks:
- Planning document exists and is complete
- Planning outcomes match execution
- Alternatives considered (if applicable)
- Risk assessment present (if applicable)

**Note:** Skipped for task tier (tasks don't have planning docs)

### Todos Audit

Checks:
- Todo exists for tier
- Todo status is appropriate
- Child todos created (if applicable)
- Todo propagation to parent tiers
- Todo citations (if applicable)

### Security Audit

Checks:
- Security guidelines adherence (SECURITY_GUIDELINES.md)
- No exposed secrets
- Input validation present
- Authentication/authorization patterns
- SQL injection prevention
- XSS prevention

**Note:** Wraps existing `/security-audit` command with tier-specific context

### Checkpoints Audit

Checks:
- Checkpoints documented in log
- Checkpoint format compliance
- Learning checkpoints present (for complex tasks)
- Quality verification completed

### Tests Audit

Checks:
- Tests created (if applicable)
- Test coverage adequate
- Test quality (descriptive headers, proper structure)
- If no tests, reason documented

### Docs Audit

Checks:
- Guide exists and has required sections
- Log entries complete and formatted correctly
- Handover document updated with transition context
- Document structure compliance (per templates)

**Note:** Skipped for task tier (tasks use session-level docs)

## Output Format

### Audit Report Files

Audit reports are written to:
`.cursor/project-manager/features/[feature]/audits/[tier]-[id]-audit.md`

Reports include:
- Audit Summary (overall status)
- Individual audit results for each category
- Findings (errors, warnings, info)
- Recommendations
- Overall recommendations

### Structured Data

All audit commands return structured data:
- `success`: boolean
- `auditResult`: TierAuditResult with all results
- `reportPath`: Path to audit report file
- `output`: Formatted markdown output

## Error Handling

- All audits are non-blocking
- Failures are logged but don't prevent workflow completion
- Audit failures reported in end command output
- Structured error information in audit results

## Best Practices

1. **Review audit reports** after each workflow completion
2. **Address findings** before starting next tier
3. **Use audit results** to refine workflow processes
4. **Run audits manually** if needed: `/audit-[tier] [id]`
5. **Check audit reports** in `.cursor/project-manager/features/[feature]/audits/`

## Related Documentation

- [Todo Commands](../todo/README.md) - Todo management integration
- [Security Commands](../security/README.md) - Security audit integration
- [Testing Commands](../testing/README.md) - Test results integration
- [Validation Commands](../validation/README.md) - Workflow validation

