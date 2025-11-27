# Document Operations Commands

This directory contains slash commands for document operations in the workflow system. These commands abstract document section operations from workflow execution, enabling reusable document manipulation logic across all tiers.

## Overview

Document commands are organized into **atomic** (single-responsibility) operations. All commands follow the existing command pattern and can be called programmatically or via slash commands.

The document abstraction uses `WorkflowCommandContext` for paths (no hardcoding), following the same pattern as todo/planning abstractions.

## Quick Reference

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for a one-page lookup table.

## Command Categories

### Atomic Commands

#### Section Operations
- `readSection(params)` - Read specific section from document
- `extractSectionProgrammatic(params)` - Extract section content (programmatic API)
- `listSections(params)` - List all sections in document
- `listSectionsProgrammatic(params)` - List sections (programmatic API)

## Usage Examples

### Programmatic Usage

```typescript
import { readSection, extractSectionProgrammatic, listSections } from './cursor/commands/document';

// Read a section
const sectionContent = await readSection({
  tier: 'session',
  identifier: '2.1',
  sectionTitle: 'Current Status',
  docType: 'guide'
});

// Extract section (programmatic)
const result = await extractSectionProgrammatic({
  tier: 'phase',
  identifier: '1',
  sectionTitle: 'Next Steps',
  docType: 'handoff'
});

if (result.success && result.sectionContent) {
  // Use section content
}

// List sections
const sectionsList = await listSections({
  tier: 'feature',
  docType: 'guide'
});
```

### Slash Command Usage

Commands can be invoked via slash commands (if configured in your environment):
- `/document-read-section session 2.1 "Current Status" guide`
- `/document-list-sections feature guide`
- `/document-extract-section phase 1 "Next Steps" handoff`

## Integration with Workflow Commands

Document commands are designed to be called from workflow manager commands:

```typescript
import { extractSectionProgrammatic } from './cursor/commands/document';

// In a workflow command
export async function generateHandoff(tier: string, identifier: string): Promise<string> {
  // Extract current status section
  const statusResult = await extractSectionProgrammatic({
    tier: tier as DocumentTier,
    identifier,
    sectionTitle: 'Current Status',
    docType: 'guide'
  });
  
  if (statusResult.success && statusResult.sectionContent) {
    // Use status content in handoff generation...
  }
}
```

## Document Types

Commands support three document types:
- **guide** - Planning and reference documents
- **log** - Activity and progress logs
- **handoff** - Transition context documents

## Document Tiers

Commands support all workflow tiers:
- **Feature** (Tier 0) - Feature-level documents
- **Phase** (Tier 1) - Phase-level documents (requires identifier)
- **Session** (Tier 2) - Session-level documents (requires identifier in X.Y format)

## Architecture

### Utilities

Core document logic uses utilities from `.cursor/commands/utils/`:
- `DocumentManager` - Document read/write operations
- `MarkdownUtils` - Section extraction and manipulation
- `WorkflowCommandContext` - Path resolution and context

### Commands

Command wrappers are in `.cursor/commands/document/`:
- `atomic/` - Single-responsibility commands

## Best Practices

1. **Use programmatic API** when calling from other commands
2. **Use CLI API** for direct user interaction
3. **Specify docType** explicitly when not using default (guide)
4. **Validate identifiers** before calling (phase/session require identifiers)
5. **Handle errors gracefully** - commands return formatted error messages

## Related Documentation

- [Todo Commands](../todo/README.md) - Similar abstraction pattern
- [Planning Commands](../planning/README.md) - Similar abstraction pattern
- [Project Manager](../../project-manager/PROJECT_MANAGER_HANDOFF.md) - Core workflow utilities
- Document templates in `.cursor/commands/tiers/*/templates/`

