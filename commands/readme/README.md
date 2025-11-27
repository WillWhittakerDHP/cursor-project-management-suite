# README Management Commands

Commands for managing README files, detecting temporary documentation, consolidating content, and maintaining documentation standards.

## Overview

This module provides commands to create, validate, audit, and manage README files across the codebase. It helps maintain documentation standards, detect temporary files, consolidate duplicate content, and prevent documentation bloat.

## Quick Reference

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for a one-page lookup table.

## Command Categories

### Atomic Commands

- `/readme-create [filePath] [type] [title] [purpose]` - Create README with template
- `/readme-audit [directory]` - Audit READMEs in directory
- `/readme-validate [filePath]` - Validate README structure
- `/readme-extract-section [filePath] [section]` - Extract specific section
- `/readme-mark-temporary [filePath] [reason] [expiry?] [consolidateInto?]` - Mark README as temporary
- `/readme-detect-temporary [filePath]` - Detect if README is temporary
- `/readme-consolidate-findings [tempReadme] [targetReadme]` - Consolidate temporary findings

### Composite Commands

- `/readme-audit-all` - Audit all READMEs in .cursor folder
- `/readme-consolidate [sources...] [target]` - Consolidate multiple READMEs
- `/readme-split [filePath] [sections...]` - Split large README into README + GUIDE
- `/readme-cleanup-temporary [directory] [options]` - Clean up temporary READMEs
- `/readme-workflow-cleanup [tier] [identifier]` - Workflow-integrated cleanup

## Usage Examples

### Create a New README

\`\`\`
/readme-create .cursor/commands/new-module/README.md module "New Module" "Commands for new module functionality"
\`\`\`

### Mark File as Temporary

\`\`\`
/readme-mark-temporary .cursor/commands/STATUS.md "Implementation status tracking" 2025-02-27 .cursor/commands/README.md
\`\`\`

### Audit All READMEs

\`\`\`
/readme-audit-all
\`\`\`

### Clean Up Temporary Files

\`\`\`
/readme-cleanup-temporary .cursor --auto-consolidate
\`\`\`

### Programmatic Usage

\`\`\`typescript
import { 
  createReadme, 
  auditAllReadmes, 
  cleanupTemporaryReadmes 
} from './cursor/commands/readme';

// Create README
await createReadme({
  filePath: '.cursor/commands/new-module/README.md',
  type: 'module',
  title: 'New Module',
  purpose: 'Commands for new module functionality',
});

// Audit all READMEs
const report = await auditAllReadmes();
console.log(report);

// Cleanup temporary files
await cleanupTemporaryReadmes('.cursor', { autoConsolidate: true });
\`\`\`

## Related Documentation

- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - One-page command lookup
- [README Standards](../../../README_AUDIT_REPORT.md) - Documentation standards and guidelines
- [Templates](./templates/) - README templates for different types

