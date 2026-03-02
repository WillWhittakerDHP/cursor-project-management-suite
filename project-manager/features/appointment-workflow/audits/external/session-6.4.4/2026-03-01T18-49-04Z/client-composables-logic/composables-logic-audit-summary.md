**Instructions for AI / tooling:** Treat the findings in this report as canonical. Do not plan or change the audit scripts unless you have asked the user and received explicit approval to do so.

**When fixing a finding:** Search the codebase for the same rule or pattern (same ruleId or equivalent) and fix all similar occurrences consistently. Ensure the fix does not introduce new violations of this or related rules.


# Composables Logic Audit Summary (Generated)

Generated from `client/.audit-reports/composables-logic-audit.json`.

## Top 30 composable files

| File | Priority | score | exports(use*) | vue-query | watch | computed | ref | async | await | DOM | console |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `client/src/composables/admin/useInstanceGrouping.ts` | P2 | 14 | 1 | 0 | 1 | 6 | 0 | 0 | 0 | 0 | 0 |
| `client/src/composables/admin/useShapeForm.ts` | P2 | 15 | 1 | 0 | 0 | 4 | 2 | 5 | 4 | 0 | 0 |
| `client/src/composables/admin/useSelectHandlers.ts` | P2 | 12 | 1 | 0 | 0 | 1 | 1 | 3 | 3 | 0 | 0 |
| `client/src/composables/admin/useShapesTabCreation.ts` | P2 | 11 | 1 | 0 | 0 | 0 | 7 | 2 | 2 | 0 | 0 |
| `client/src/composables/booking/useContactsValidation.ts` | P2 | 16 | 1 | 0 | 0 | 16 | 0 | 0 | 0 | 0 | 0 |
| `client/src/composables/useRelationship.ts` | P2 | 14 | 0 | 0 | 0 | 1 | 0 | 6 | 7 | 0 | 0 |
| `client/src/composables/admin/useBusinessRulesTab.ts` | P2 | 14 | 1 | 0 | 1 | 4 | 0 | 3 | 4 | 0 | 0 |
| `client/src/composables/admin/useSelectConfig.ts` | P2 | 14 | 1 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 |
| `client/src/composables/booking/useAvailabilityOrchestrator.ts` | P2 | 15 | 1 | 0 | 5 | 9 | 0 | 0 | 0 | 0 | 0 |
| `client/src/composables/admin/useSelectFiltering.ts` | P2 | 7 | 1 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 |
| `client/src/composables/booking/useWizardFilteredOptions.ts` | P2 | 14 | 1 | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 0 |
| `client/src/composables/dev/useApiDevPanelData.ts` | P2 | 14 | 1 | 0 | 0 | 0 | 2 | 6 | 6 | 0 | 0 |
| `client/src/composables/useAddressAutocomplete.ts` | P2 | 14 | 1 | 0 | 1 | 0 | 4 | 4 | 5 | 0 | 0 |
| `client/src/composables/useSelectOptions.ts` | P2 | 12 | 1 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 |
| `client/src/composables/admin/useAdminAvailabilitySettings.ts` | P2 | 12 | 1 | 0 | 1 | 0 | 3 | 2 | 3 | 0 | 0 |
| `client/src/composables/admin/useEntityCardSubPanels.ts` | P2 | 12 | 1 | 0 | 1 | 10 | 0 | 0 | 0 | 0 | 0 |
| `client/src/composables/admin/useBlockInstanceForm.ts` | P2 | 9 | 1 | 0 | 0 | 3 | 1 | 2 | 2 | 0 | 0 |
| `client/src/composables/admin/useCalibrationChart.ts` | P2 | 12 | 1 | 0 | 0 | 6 | 3 | 0 | 0 | 0 | 0 |
| `client/src/composables/admin/useInstanceDragAndDrop.ts` | P2 | 8 | 1 | 0 | 2 | 1 | 4 | 0 | 0 | 0 | 0 |
| `client/src/composables/admin/usePartInstanceForm.ts` | P2 | 9 | 1 | 0 | 0 | 3 | 1 | 2 | 2 | 0 | 0 |
| `client/src/composables/booking/useAvailabilityLogic.ts` | P2 | 12 | 1 | 0 | 1 | 8 | 0 | 0 | 0 | 0 | 0 |
| `client/src/composables/booking/useMoveablePartsScheduling.ts` | P2 | 12 | 1 | 0 | 1 | 4 | 2 | 1 | 1 | 0 | 0 |
| `client/src/composables/fieldContext/useFieldContextState.ts` | P2 | 12 | 0 | 0 | 0 | 8 | 3 | 0 | 0 | 0 | 0 |
| `client/src/composables/admin/useDifferentialPerspectives.ts` | P2 | 10 | 1 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 |
| `client/src/composables/admin/useSelectInputsAsync.ts` | P2 | 10 | 1 | 0 | 0 | 1 | 0 | 4 | 3 | 0 | 0 |
| `client/src/composables/booking/selectionCard/useSelectionCard.ts` | P2 | 11 | 2 | 0 | 0 | 3 | 8 | 0 | 0 | 0 | 0 |
| `client/src/composables/useComponentDistribution.ts` | P2 | 11 | 1 | 0 | 2 | 4 | 2 | 0 | 0 | 0 | 0 |
| `client/src/composables/admin/tables/useAppointmentsTableModel.ts` | P2 | 9 | 1 | 0 | 0 | 3 | 0 | 3 | 0 | 0 | 0 |
| `client/src/composables/admin/useInstanceBulkEdit.ts` | P2 | 10 | 1 | 0 | 0 | 2 | 4 | 2 | 1 | 0 | 0 |
| `client/src/composables/admin/usePartsTotals.ts` | P2 | 8 | 1 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 0 |

*...and 187 more. See full report.*

## Notes

- This is a *signal* index. Use the full report: `client/.audit-reports/composables-logic-audit.md`.
