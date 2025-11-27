---
# This file is NOT loaded by Cursor (no alwaysApply directive)
# It serves as a routing/reference document only
---

# Coding Rules Routing Guide

**Purpose:** Quick reference guide to locate specific rules across the split rule files.

**Status:** This file is a routing document only. It is NOT loaded by Cursor. Use the split files below for actual rules.

---

## Quick Reference: Rule Number to File Mapping

### User Rules (Personal Preferences & Workflow)
**File:** `.cursor/rules/USER_CODING_RULES.md` (loaded automatically)

| Rule Number | Rule Name | Section |
|------------|-----------|---------|
| Rule 9 | Supportive and Explicit Communication | COMMUNICATION PREFERENCE |
| Rule 14 | Educational Code Comments | LEARNING-FOCUSED RULES |
| Rule 15 | Learning Checkpoints | LEARNING-FOCUSED RULES |
| Rule 16 | Pattern Explanation | LEARNING-FOCUSED RULES |
| Rule 17 | Progressive Complexity | LEARNING-FOCUSED RULES |
| Rule 18 | Active Learning Encouragement | LEARNING-FOCUSED RULES |
| Rule 19 | Three-Tier Structured Workflow Management | SESSION WORKFLOW RULES (REMOVED - Use Rule 22) |
| Rule 22 | Four-Tier Structured Workflow Management | SESSION WORKFLOW RULES (CURRENT) |
| Rule 23 | Ask Mode vs Agent Mode Workflow | WORKFLOW MODE RULES |
| Rule 24 | Tier-Appropriate Change Commands (Mandatory) | WORKFLOW MODE RULES |

### Project Rules (Technical Standards)
**File:** `.cursor/rules/PROJECT_CODING_RULES.md` (loaded automatically)

| Rule Number | Rule Name | Section |
|------------|-----------|---------|
| Rule 1 | No Unnecessary Additions During Refactors | CRITICAL PROJECT RULES |
| Rule 2 | Generic Patterns with Runtime Configurations | CRITICAL PROJECT RULES |
| Rule 3 | Clear Transformation Functions Over Prop-Drilling | CRITICAL PROJECT RULES |
| Rule 4 | Type Safety - Avoid Assertions and Use Explicit Return Types | TYPE SAFETY RULES |
| Rule 5 | Descriptive Generic Type Names | TYPE SAFETY RULES |
| Rule 6 | Strategic Memoization | CODE QUALITY RULES |
| Rule 7 | Functional Approaches Over Mutations | CODE QUALITY RULES |
| Rule 8 | Explicit Error Handling | CODE QUALITY RULES |
| Rule 10 | Test File Documentation | TESTING RULES |
| Rule 11 | Test File Immutability | TESTING RULES |
| Rule 12 | Testing Strategy - Hybrid Approach | TESTING RULES |
| Rule 13 | Test Execution in Development | TESTING RULES |
| Rule 20 | Mobile-First Responsive Design | RESPONSIVE DESIGN RULES |
| Rule 21 | Documentation Checks at Critical Junctures | DOCUMENTATION & PATTERN REUSE RULES |
| Rule 22 | Pattern Reuse and Generic Component Creation | DOCUMENTATION & PATTERN REUSE RULES |

**Note:** Rule 22 appears in both files - Rule 22 in USER_CODING_RULES.md is about workflow management, Rule 22 in PROJECT_CODING_RULES.md is about pattern reuse.

---

## File Locations

### Active Rules Files (Loaded by Cursor)
- **`.cursor/rules/USER_CODING_RULES.md`** - User preferences and workflow rules
- **`.cursor/rules/PROJECT_CODING_RULES.md`** - Technical standards and code quality rules

### Compact Versions (For Cursor Settings Tab)
- **`.cursor/rules/USER_CODING_RULES_COMPACT.md`** - Compact user rules
- **`.cursor/rules/PROJECT_CODING_RULES_COMPACT.md`** - Compact project rules

### Reference Documents
- **`.cursor/RULES_IMPLEMENTATION_SUMMARY.md`** - Summary of rules organization and recommendations

---

## Migration Notes

### Why This File Exists

This file originally contained all coding rules in a single document. It was split into separate files to:
- **Improve organization** - Separate user preferences from technical standards
- **Reduce cognitive overhead** - Agents only load relevant rule categories
- **Enable targeted updates** - Update user or project rules independently
- **Support compact versions** - Create condensed formats for Cursor settings

### Migration History

**Original Structure:**
- Single file: `CODING_RULES_FOR_SETTINGS.md` (1453 lines)
- All rules in one place
- Difficult to navigate and maintain

**Current Structure:**
- User rules: `USER_CODING_RULES.md` (606 lines)
- Project rules: `PROJECT_CODING_RULES.md` (832 lines)
- Compact versions for settings interface
- Clear separation of concerns

### How to Use This File

**For Quick Lookups:**
- Use the Quick Reference table above to find which file contains a specific rule
- Navigate directly to the rule file and section

**For Understanding Organization:**
- Review the File Locations section to understand the file structure
- Check Migration Notes to understand why the split occurred

**Important:** This file is NOT loaded by Cursor. It's a reference document only. The actual rules are in the split files listed above.

---

## Related Documentation

- **`.cursor/RULES_IMPLEMENTATION_SUMMARY.md`** - Complete guide to rules organization
- **`.cursor/workflow/WORKFLOW_MANAGER_HANDOFF.md`** - Workflow system documentation
- **`.cursor/workflow/docs/feature-tier-architecture.md`** - Four-tier workflow architecture

---

**Last Updated:** 2025-01-XX  
**Status:** Routing/Reference Document (Not Loaded by Cursor)
