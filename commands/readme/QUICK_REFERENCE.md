# README Management Quick Reference

## Commands Table

| Command | Type | Description | Parameters |
|---------|------|-------------|------------|
| `/readme-create` | Atomic | Create README with template | `filePath`, `type`, `title`, `purpose` |
| `/readme-audit` | Atomic | Audit READMEs in directory | `directory` |
| `/readme-validate` | Atomic | Validate README structure | `filePath` |
| `/readme-extract-section` | Atomic | Extract specific section | `filePath`, `section` |
| `/readme-mark-temporary` | Atomic | Mark README as temporary | `filePath`, `reason`, `expiry?`, `consolidateInto?` |
| `/readme-detect-temporary` | Atomic | Detect if README is temporary | `filePath` |
| `/readme-consolidate-findings` | Atomic | Consolidate temporary findings | `tempReadme`, `targetReadme` |
| `/readme-audit-all` | Composite | Audit all READMEs in .cursor | - |
| `/readme-consolidate` | Composite | Consolidate multiple READMEs | `sources...`, `target` |
| `/readme-split` | Composite | Split large README | `filePath`, `sections...` |
| `/readme-cleanup-temporary` | Composite | Clean up temporary READMEs | `directory`, `options?` |
| `/readme-workflow-cleanup` | Composite | Workflow-integrated cleanup | `tier`, `identifier` |

## README Types

- `module` - Module README (commands, features)
- `guide` - Detailed guide documentation
- `quick-reference` - Quick reference lookup table
- `temporary` - Temporary status file

## Examples

### Create Module README

\`\`\`
/readme-create .cursor/commands/new-module/README.md module "New Module" "Commands for new module"
\`\`\`

### Mark as Temporary

\`\`\`
/readme-mark-temporary .cursor/commands/STATUS.md "Status tracking" 2025-02-27 .cursor/commands/README.md
\`\`\`

### Audit Directory

\`\`\`
/readme-audit .cursor/commands
\`\`\`

### Cleanup Temporary Files

\`\`\`
/readme-cleanup-temporary .cursor --auto-consolidate
\`\`\`

