# Code Comments Quick Reference

## Commands

| Command | Function | Parameters | Description |
|---------|----------|------------|-------------|
| `/comment-add` | `addComment` | `filePath, lineNumber, commentType, title, body, resourceUrl?, language?` | Add comment to file at specific line |
| `/comment-review` | `reviewFile` | `filePath` | Review file and suggest where comments needed |
| `/comment-batch` | `addCommentsBatch` | `files[], commentType, language?` | Add comments to multiple files |
| `/comment-review-and-add` | `reviewAndAdd` | `filePath, autoAdd?` | Review file and add comments |

## Comment Types

- **STRUCTURED** - WHAT/HOW/WHY format for decision points (what, how, why required; see optional)
- **REFERENCE** - Reference to established patterns (reference required)
- **LEARNING** - Explain new concepts
- **WHY** - Explain rationale for decisions
- **COMPARISON** - Show framework differences
- **PATTERN** - Explain architectural patterns
- **RESOURCE** - Link to learning materials

## Parameter Types

- **filePath**: `string` (relative to project root)
- **lineNumber**: `number` (1-indexed)
- **commentType**: `'LEARNING' | 'WHY' | 'COMPARISON' | 'PATTERN' | 'RESOURCE' | 'STRUCTURED' | 'REFERENCE'`
- **title**: `string` (comment title)
- **body**: `string` (comment body, can include newlines)
- **resourceUrl**: `string | undefined` (for RESOURCE type)
- **what**: `string | undefined` (for STRUCTURED type, required)
- **how**: `string | undefined` (for STRUCTURED type, required)
- **why**: `string | undefined` (for STRUCTURED type, required)
- **see**: `string | undefined` (for STRUCTURED type, optional reference)
- **reference**: `string | undefined` (for REFERENCE type, required)
- **language**: `string | undefined` (auto-detected from file extension)

## Return Types

```typescript
Promise<string> // Formatted markdown output
```

## Examples

### Add LEARNING Comment
```typescript
await addComment({
  filePath: 'client-vue/src/composables/useEntity.ts',
  lineNumber: 42,
  commentType: 'LEARNING',
  title: 'Vue.js Computed Properties',
  body: 'In React, we\'d use useMemo(() => value * 2, [value])\nIn Vue.js, computed() automatically tracks dependencies'
});
```

### Add WHY Comment
```typescript
await addComment({
  filePath: 'client-vue/src/composables/useEntity.ts',
  lineNumber: 10,
  commentType: 'WHY',
  title: 'Using ref() instead of reactive()',
  body: 'ref() is better for primitives (strings, numbers, booleans)\nreactive() is better for objects'
});
```

### Add RESOURCE Comment
```typescript
await addComment({
  filePath: 'client-vue/src/composables/useEntity.ts',
  lineNumber: 5,
  commentType: 'RESOURCE',
  title: 'Vue.js Reactivity Fundamentals',
  body: 'This code demonstrates reactive state management.',
  resourceUrl: 'https://vuejs.org/guide/essentials/reactivity-fundamentals.html'
});
```

### Add STRUCTURED Comment
```typescript
await addComment({
  filePath: 'client-vue/src/composables/useEntity.ts',
  lineNumber: 50,
  commentType: 'STRUCTURED',
  title: 'Vue Query Mutation Pattern',
  what: 'Using Vue Query\'s useMutation for API updates',
  how: 'Following the mutation pattern with error handling',
  why: 'Consistent error handling and loading states',
  see: 'client-vue/src/composables/useEntity.ts::useEntityMutation'
});
```

### Add REFERENCE Comment
```typescript
await addComment({
  filePath: 'client-vue/src/composables/useSchemaProp.ts',
  lineNumber: 30,
  commentType: 'REFERENCE',
  title: 'Entity Mutation Pattern',
  body: 'This mutation handles schema prop operations with the same pattern.',
  reference: 'client-vue/src/composables/useEntity.ts::useEntityMutation'
});
```

### Review File
```typescript
await reviewFile('client-vue/src/composables/useEntity.ts');
```

## Comment Format

Comments are formatted based on language:
- **TypeScript/JavaScript**: `/** */` style
- **Python**: `"""` style
- **Java/C/C++**: `/** */` style

## Common Patterns

### Add Comment Before Function
```typescript
// Function starts at line 50
await addComment({
  filePath: 'file.ts',
  lineNumber: 50, // Comment will be inserted before this line
  commentType: 'WHY',
  title: 'Function Purpose',
  body: 'This function handles...'
});
```

### Batch Add Comments
```typescript
await addCommentsBatch({
  files: [
    { filePath: 'file1.ts', lineNumber: 10, title: 'Title 1', body: 'Body 1' },
    { filePath: 'file2.ts', lineNumber: 20, title: 'Title 2', body: 'Body 2' }
  ],
  commentType: 'LEARNING'
});

// Batch add STRUCTURED comments
await addCommentsBatch({
  files: [
    {
      filePath: 'file1.ts',
      lineNumber: 10,
      title: 'Pattern Name',
      body: '',
      what: 'What we\'re doing',
      how: 'How we\'re doing it',
      why: 'Why it works'
    }
  ],
  commentType: 'STRUCTURED'
});
```

