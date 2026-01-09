# Component Test Template

Use this template when creating component tests for React/Vue components with user interactions and side effects.

## Template Structure

```typescript
/**
 * [DESCRIPTIVE TEST SUITE NAME]
 * 
 * Component tests for [component name].
 * Tests [what is being tested - e.g., user interactions, rendering, props handling].
 * 
 * @immutable - Mark as immutable once tests pass and are stable
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { [Component] } from '[relative path to source]';

// ===================================================================
// TEST SETUP
// ===================================================================

describe('[Component Name]', () => {
  
  // ===================================================================
  // RENDERING TESTS
  // ===================================================================
  
  describe('Rendering', () => {
    it('should render [component/element]', () => {
      // Arrange
      const props = { [prop values] };
      
      // Act
      render(<Component {...props} />);
      
      // Assert
      expect(screen.getByText([text])).toBeInTheDocument();
    });
    
    it('should render with [conditional rendering case]', () => {
      // Test conditional rendering
    });
  });
  
  // ===================================================================
  // USER INTERACTION TESTS
  // ===================================================================
  
  describe('User Interactions', () => {
    it('should handle [user action]', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<Component />);
      
      // Act
      await user.click(screen.getByRole('button', { name: '[button name]' }));
      
      // Assert
      expect([expected result]).toBe([expected value]);
    });
  });
  
  // ===================================================================
  // PROPS HANDLING TESTS
  // ===================================================================
  
  describe('Props Handling', () => {
    it('should handle [prop scenario]', () => {
      // Test prop handling
    });
  });
  
  // ===================================================================
  // STATE MANAGEMENT TESTS
  // ===================================================================
  
  describe('State Management', () => {
    it('should update state when [action]', () => {
      // Test state updates
    });
  });
  
  // ===================================================================
  // SIDE EFFECTS TESTS
  // ===================================================================
  
  describe('Side Effects', () => {
    it('should [side effect behavior]', () => {
      // Test side effects
    });
  });
});
```

## Best Practices

1. **Descriptive Header**: Always include a descriptive header comment explaining what is tested
2. **User-Centric Testing**: Test from user's perspective, not implementation details
3. **Accessibility**: Use accessible queries (getByRole, getByLabelText)
4. **Async Interactions**: Use userEvent.setup() for async user interactions
5. **Mock External Dependencies**: Mock API calls and external services
6. **Immutability Marker**: Add `@immutable` comment once tests are stable and passing

## Coverage Expectations

- Aim for 70%+ coverage on components with logic
- Test user interactions
- Test props and state handling
- Test error states and edge cases

