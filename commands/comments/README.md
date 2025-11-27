# Code Comments Commands

This directory contains slash commands for adding learning-focused comments to code files. These commands help document code with educational comments following patterns from `LEARNING_STRATEGIES.md`.

## Overview

Comment commands are organized into **atomic** (single-responsibility) and **composite** (multi-step workflows) operations. All commands follow the existing command pattern and can be called programmatically or via slash commands.

The comment abstraction supports seven comment types: LEARNING, WHY, COMPARISON, PATTERN, RESOURCE, STRUCTURED, and REFERENCE.

## Quick Reference

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for a one-page lookup table.

## Command Categories

### Atomic Commands

#### Comment Operations
- `formatComment(content, language)` - Format comment based on type
- `addComment(params)` - Add comment to file at specific line
- `reviewFile(filePath)` - Review file and suggest where comments needed

### Composite Commands

- `addCommentsBatch(params)` - Add comments to multiple files
- `reviewAndAdd(params)` - Review file and add comments based on suggestions

## Comment Types

### LEARNING
Explain new concepts when they first appear:
```typescript
/**
 * LEARNING: Vue.js Computed Properties
 * 
 * In React, we'd use useMemo(() => value * 2, [value])
 * In Vue.js, computed() automatically tracks dependencies
 */
```

### WHY
Explain rationale for decisions:
```typescript
/**
 * WHY: Using ref() instead of reactive()
 * 
 * ref() is better for primitives (strings, numbers, booleans)
 * reactive() is better for objects
 */
```

### COMPARISON
Show React → Vue.js differences:
```typescript
/**
 * COMPARISON: React useEffect vs Vue watchEffect
 * 
 * React: useEffect(() => { fetchData() }, [dependency])
 * Vue: watchEffect(() => { fetchData() })
 */
```

### PATTERN
Explain architectural patterns:
```typescript
/**
 * PATTERN: Composition API vs Options API
 * 
 * We're using Composition API because:
 * 1. Better TypeScript support
 * 2. More flexible code organization
 */
```

### RESOURCE
Link to learning materials:
```typescript
/**
 * RESOURCE: Vue.js Reactivity Fundamentals
 * https://vuejs.org/guide/essentials/reactivity-fundamentals.html
 */
```

### STRUCTURED
Comprehensive WHAT/HOW/WHY format for decision points:
```typescript
/**
 * STRUCTURED: Vue Query Mutation Pattern
 * 
 * WHAT: Using Vue Query's useMutation for API updates
 * 
 * HOW: Following the mutation pattern with error handling
 * 
 * WHY: Consistent error handling and loading states
 * 
 * SEE: client-vue/src/composables/useEntity.ts::useEntityMutation
 */
```

### REFERENCE
Lightweight reference to established patterns:
```typescript
/**
 * REFERENCE: Entity Mutation Pattern
 * See: client-vue/src/composables/useEntity.ts::useEntityMutation
 * 
 * This mutation handles bulk operations with the same pattern.
 */
```

## Usage Examples

### Programmatic Usage

```typescript
import { addComment, reviewFile, addCommentsBatch } from './cursor/commands/comments';

// Add a LEARNING comment
await addComment({
  filePath: 'client-vue/src/composables/useEntity.ts',
  lineNumber: 42,
  commentType: 'LEARNING',
  title: 'Vue.js Computed Properties',
  body: 'In React, we\'d use useMemo(() => value * 2, [value])\nIn Vue.js, computed() automatically tracks dependencies'
});

// Add a STRUCTURED comment
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

// Add a REFERENCE comment
await addComment({
  filePath: 'client-vue/src/composables/useSchemaProp.ts',
  lineNumber: 30,
  commentType: 'REFERENCE',
  title: 'Entity Mutation Pattern',
  body: 'This mutation handles schema prop operations with the same pattern.',
  reference: 'client-vue/src/composables/useEntity.ts::useEntityMutation'
});

// Review a file
const reviewOutput = await reviewFile('client-vue/src/composables/useEntity.ts');

// Add comments to multiple files
await addCommentsBatch({
  files: [
    {
      filePath: 'file1.ts',
      lineNumber: 10,
      title: 'Title',
      body: 'Body'
    }
  ],
  commentType: 'WHY'
});
```

### Slash Command Usage

Commands can be invoked via slash commands (if configured in your environment):
- `/comment-add client-vue/src/composables/useEntity.ts 42 LEARNING "Vue.js Computed Properties" "In React, we'd use useMemo..."`
- `/comment-review client-vue/src/composables/useEntity.ts`
- `/comment-batch [files] WHY`

## Supported Languages

Comments are automatically formatted based on file extension:
- TypeScript/JavaScript: `/** */` style
- Python: `"""` style
- Java/C/C++: `/** */` style

## Architecture

### Utilities

Core comment logic:
- File reading/writing using Node.js `fs/promises`
- Language detection from file extension
- Comment formatting based on language syntax

### Commands

Command wrappers are in `.cursor/commands/comments/`:
- `atomic/` - Single-responsibility commands
- `composite/` - Multi-step workflows

## Best Practices

1. **Use STRUCTURED** for decision points and first occurrences (WHAT/HOW/WHY)
2. **Use REFERENCE** for repeated patterns (link to original explanation)
3. **Use LEARNING** for new concepts
4. **Use WHY** for decision rationale
5. **Use COMPARISON** for framework differences
6. **Use PATTERN** for architectural patterns
7. **Use RESOURCE** for documentation links
8. **Review files** before adding comments
9. **Keep comments concise** but informative
10. **Place strategically** at decision points, not every line

See [STRATEGIC_PLACEMENT_GUIDE.md](./STRATEGIC_PLACEMENT_GUIDE.md) for detailed guidance on when and where to use each comment type.

## Related Documentation

- [Strategic Placement Guide](./STRATEGIC_PLACEMENT_GUIDE.md) - When and where to use STRUCTURED and REFERENCE comments
- [Learning Strategies](../../../LEARNING_STRATEGIES.md) - Comment patterns and learning strategies
- [Project Manager](../../project-manager/PROJECT_MANAGER_HANDOFF.md) - Core workflow utilities

