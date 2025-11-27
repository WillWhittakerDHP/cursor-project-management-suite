# Document Operations Quick Reference

## Commands

| Command | Function | Parameters | Description |
|---------|----------|------------|-------------|
| `/document-read-section` | `readSection` | `tier, identifier?, sectionTitle, docType?, featureName?` | Read specific section from document |
| `/document-list-sections` | `listSections` | `tier, identifier?, docType?, featureName?` | List all sections in document |
| `/document-extract-section` | `extractSectionProgrammatic` | `tier, identifier?, sectionTitle, docType?, featureName?` | Extract section (programmatic) |

## Parameter Types

- **tier**: `'feature' | 'phase' | 'session'`
- **identifier**: `string | undefined` (required for phase/session)
- **sectionTitle**: `string` (section heading text)
- **docType**: `'guide' | 'log' | 'handoff'` (default: 'guide')
- **featureName**: `string` (default: 'vue-migration')

## Return Types

### CLI API (Formatted String)
```typescript
Promise<string> // Formatted markdown output
```

### Programmatic API (Structured Data)
```typescript
// extractSectionProgrammatic
Promise<{
  success: boolean;
  sectionContent?: string;
  documentPath?: string;
  error?: string;
}>

// listSectionsProgrammatic
Promise<{
  success: boolean;
  sections?: Array<{
    title: string;
    depth: number;
    lineNumber: number;
  }>;
  documentPath?: string;
  error?: string;
}>
```

## Examples

### Read Section
```typescript
await readSection({
  tier: 'session',
  identifier: '2.1',
  sectionTitle: 'Current Status',
  docType: 'guide'
});
```

### List Sections
```typescript
await listSections({
  tier: 'feature',
  docType: 'guide'
});
```

### Extract Section (Programmatic)
```typescript
const result = await extractSectionProgrammatic({
  tier: 'phase',
  identifier: '1',
  sectionTitle: 'Next Steps',
  docType: 'handoff'
});

if (result.success && result.sectionContent) {
  // Use result.sectionContent
}
```

## Common Patterns

### Extract Multiple Sections
```typescript
const sections = ['Current Status', 'Next Steps', 'Notes'];
const results = await Promise.all(
  sections.map(title => extractSectionProgrammatic({
    tier: 'session',
    identifier: '2.1',
    sectionTitle: title,
    docType: 'guide'
  }))
);
```

### Check Section Exists
```typescript
const result = await extractSectionProgrammatic({
  tier: 'feature',
  sectionTitle: 'Architecture Decisions',
  docType: 'guide'
});

if (result.success && result.sectionContent) {
  // Section exists and has content
}
```

