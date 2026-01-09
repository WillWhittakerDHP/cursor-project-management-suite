# Integration Test Template

Use this template when creating integration tests for context coordination, component integration, and user workflows.

## Template Structure

```typescript
/**
 * [DESCRIPTIVE TEST SUITE NAME]
 * 
 * Integration tests for [feature/workflow name].
 * Tests [what is being tested - e.g., data flow, context coordination, component integration].
 * 
 * @immutable - Mark as immutable once tests pass and are stable
 */

import { render, screen } from '@testing-library/react';
import { [components/contexts] } from '[relative path to source]';

// ===================================================================
// TEST SETUP
// ===================================================================

describe('[Feature/Workflow Name] Integration', () => {
  
  // ===================================================================
  // SETUP AND TEARDOWN
  // ===================================================================
  
  beforeEach(() => {
    // Setup test environment
  });
  
  afterEach(() => {
    // Cleanup
  });
  
  // ===================================================================
  // DATA FLOW TESTS
  // ===================================================================
  
  describe('Data Flow', () => {
    it('should [expected data flow behavior]', async () => {
      // Arrange
      const [test setup];
      
      // Act
      [user interactions or function calls];
      
      // Assert
      expect([expected state]).toBe([expected value]);
    });
  });
  
  // ===================================================================
  // CONTEXT COORDINATION TESTS
  // ===================================================================
  
  describe('Context Coordination', () => {
    it('should coordinate [contexts/components] correctly', async () => {
      // Test context coordination
    });
  });
  
  // ===================================================================
  // USER WORKFLOW TESTS
  // ===================================================================
  
  describe('User Workflow', () => {
    it('should complete [workflow step]', async () => {
      // Test user workflow steps
    });
  });
  
  // ===================================================================
  // ERROR HANDLING TESTS
  // ===================================================================
  
  describe('Error Handling', () => {
    it('should handle [error scenario]', async () => {
      // Test error handling
    });
  });
});
```

## Best Practices

1. **Descriptive Header**: Always include a descriptive header comment explaining what is tested
2. **Test Real Workflows**: Test actual user workflows, not just isolated components
3. **Context Setup**: Properly set up contexts and providers
4. **Async Handling**: Use proper async/await patterns for async operations
5. **Cleanup**: Always clean up after tests
6. **Immutability Marker**: Add `@immutable` comment once tests are stable and passing

## Coverage Expectations

- Focus on critical paths
- Test user workflows end-to-end
- Verify context coordination
- Test error scenarios

