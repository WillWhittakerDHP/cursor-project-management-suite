# Unit Test Template

Use this template when creating unit tests for pure functions, utilities, and business logic.

## Template Structure

```typescript
/**
 * [DESCRIPTIVE TEST SUITE NAME]
 * 
 * Unit tests for [component/function/module name].
 * Tests [what is being tested - e.g., calculations, transformations, validations].
 * 
 * @immutable - Mark as immutable once tests pass and are stable
 */

import { [function/class names] } from '[relative path to source]';

// ===================================================================
// TEST SETUP
// ===================================================================

describe('[Component/Function Name]', () => {
  
  // ===================================================================
  // BASIC FUNCTIONALITY TESTS
  // ===================================================================
  
  describe('Basic Functionality', () => {
    it('should [expected behavior]', () => {
      // Arrange
      const input = [test data];
      
      // Act
      const result = [function call];
      
      // Assert
      expect(result).toBe([expected value]);
    });
    
    it('should handle [edge case]', () => {
      // Test edge cases
    });
  });
  
  // ===================================================================
  // EDGE CASES AND ERROR HANDLING
  // ===================================================================
  
  describe('Edge Cases', () => {
    it('should handle [edge case 1]', () => {
      // Test edge case
    });
    
    it('should handle [edge case 2]', () => {
      // Test edge case
    });
  });
  
  // ===================================================================
  // VALIDATION TESTS
  // ===================================================================
  
  describe('Validation', () => {
    it('should validate [validation case]', () => {
      // Test validation logic
    });
  });
});
```

## Best Practices

1. **Descriptive Header**: Always include a descriptive header comment explaining what is tested
2. **Test Organization**: Group related tests using describe blocks
3. **Clear Test Names**: Use descriptive test names that explain what is being tested
4. **Arrange-Act-Assert**: Follow AAA pattern for test structure
5. **Edge Cases**: Test edge cases and error conditions
6. **Immutability Marker**: Add `@immutable` comment once tests are stable and passing

## Coverage Expectations

- Aim for 90%+ coverage on utilities and pure functions
- Test all code paths
- Include edge cases and error handling

