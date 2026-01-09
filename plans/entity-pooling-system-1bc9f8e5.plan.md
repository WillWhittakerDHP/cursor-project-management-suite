<!-- 1bc9f8e5-d301-4f54-bbf8-38b233badb56 362237a5-58ba-4b9b-8d08-6a0bf634a2b8 -->
# Entity Pooling System Implementation Plan

## Overview

Create a configurable pooling system where entities can pool other entities of the same type, creating aggregated/composite entities. Pool masters are computed views that aggregate properties from pool members at query time. Supports hierarchical pooling where pool members can themselves be pool masters. Changes to pool members automatically update master computations, while changes to masters trigger a distribution modal to select how changes propagate to members.

## Architecture Decisions

### Pooling Model

- **Computed Masters**: Pool masters are computed views that aggregate properties from pool members (no stored totals)
- **Bidirectional Changes**:
  - **Member → Master**: Changes to pool members automatically update master's computed values (computed at query time)
  - **Master → Members**: Changes to master trigger modal to select distribution strategy (proportional, equal, manual per-member)
- **Scope**: Block profiles pool block profiles, aggregation happens at part profile level (fees/times from all part profiles across pooled blocks)

### Database Layer

- **New Model**: `PooledInstance` through table (similar to `ActivePart` pattern)
  - `pool_master_id` (FK to entity table)
  - `pool_member_id` (FK to entity table) 
  - `entity_type` (string - e.g., 'blockProfile')
  - `order_index` (for ordering pool members)
  - `disabled` (boolean)
  - Unique constraint on `(pool_master_id, pool_member_id)`
- **Location**: `server/src/db/models/scheduler/pooled_instance.ts`
- **Note**: No stored aggregated values - masters are computed at query time

### Configuration Layer

- **Extend `EntityConfig`** in `server/src/config/entityRegistry.ts`:
  ```typescript
  interface PoolingConfig {
    enabled: boolean;
    aggregationRules?: Record<string, 'sum' | 'merge' | 'first' | 'every' | 'custom'>;
    // Property-specific aggregation (e.g., baseFee: 'sum', activeParts: 'merge', onSite: 'every')
  }
  ```

- **Frontend config**: Add pooling config to entity constants/configs

### API Layer

- **New routes**: `/api/pooled-instances` for CRUD operations
- **Location**: `server/src/routes/internal/pooledInstances/`
- Endpoints: GET (all), GET (by master), POST, PATCH, DELETE

### Frontend Types

- **New types** in `client-vue/src/types/pooling.ts`:
  - `FetchedPooledInstance` (matches API response)
  - `PooledInstance` (frontend format)
  - `PoolingConfig` (matches backend config)
  - `DistributionStrategy` ('proportional' | 'equal' | 'manual')
- **Extend `GlobalEntity`** to include `pooledMembers?: GlobalEntityId[]`

### Composables

- **New composable**: `client-vue/src/composables/usePooledEntity.ts`
  - `getPooledEntity(entityKey, entityId)` - returns computed aggregated entity (always recalculates)
  - `getPoolMembers(entityKey, masterId)` - returns pool members
  - `createPool(entityKey, masterId, memberIds)` - creates pool
  - `addToPool(entityKey, masterId, memberId)` - adds member
  - `removeFromPool(entityKey, masterId, memberId)` - removes member
  - `updateMasterWithDistribution(entityKey, masterId, changes, distributionStrategy)` - updates master and distributes to members
  - Uses Vue Query for caching (invalidates when members change)

### Transformers

- **Update**: `client-vue/src/utils/transformers/fetchToGlobalTransformer.ts`
  - Fetch pooled instances alongside entities/relationships
  - Transform pooled instances to frontend format
  - Attach `pooledMembers` arrays to entities in `GlobalData`
- **New**: `client-vue/src/utils/transformers/poolingAggregator.ts`
  - `aggregatePoolProperties()` - aggregates properties from pool members at query time
  - `aggregatePartProfiles()` - aggregates part profile fees/times across pooled block profiles
  - `getPoolMembersRecursive()` - handles hierarchical pooling
  - Property aggregation strategies: sum (fees/times), merge (arrays), first (name), every (booleans)

### UI Components

- **Master Change Distribution Modal**: `client-vue/src/components/admin/pooling/MasterChangeDistributionModal.vue` (NEW)
  - Triggered when user edits computed properties on pool master
  - Options: proportional distribution, equal distribution, manual per-member
  - Shows preview of how changes will be distributed
  - Confirms distribution to all pool members
- **Pool Management UI** (Phase 2): Pool member selection interface in entity dialogs, visual representation of pool composition

## Implementation Steps

### Phase 1: Backend Foundation

1. **Create PooledInstance Model**

   - File: `server/src/db/models/scheduler/pooled_instance.ts`
   - Model with fields: `pool_master_id`, `pool_member_id`, `entity_type`, `order_index`, `disabled`
   - Factory function following `ActivePart` pattern
   - Add to model initialization in `server/src/db/models/index.ts`

2. **Add Pooling Config to Entity Registry**

   - File: `server/src/config/entityRegistry.ts`
   - Extend `EntityConfig` interface with optional `pooling?: PoolingConfig`
   - Add example config for `blockProfile` entity type with aggregation rules

3. **Create Pooled Instances API Routes**

   - File: `server/src/routes/internal/pooledInstances/pooledInstanceRouter.ts`
   - CRUD endpoints: GET (all), GET (by master), POST, PATCH, DELETE
   - Validation: ensure pool master and members are same entity type
   - Prevent circular references in hierarchical pools

4. **Register Routes**

   - File: `server/src/routes/internal/index.ts` (or main router)
   - Mount `/api/pooled-instances` route

### Phase 2: Frontend Types & Constants

5. **Create Pooling Types**

   - File: `client-vue/src/types/pooling.ts`
   - `FetchedPooledInstance` (matches API response)
   - `PooledInstance` (frontend format)
   - `PoolingConfig` (matches backend config)
   - `DistributionStrategy` type

6. **Add Pooling Constants**

   - File: `client-vue/src/constants/pooling.ts` (or extend existing)
   - Pooling relationship key constants
   - Aggregation strategy constants
   - Distribution strategy constants

7. **Extend Entity Types**

   - File: `client-vue/src/types/entities.ts`
   - Add optional `pooledMembers?: GlobalEntityId[]` to `BaseGlobalEntity`
   - Add optional `isPoolMaster?: boolean` flag

### Phase 3: Data Fetching & Transformation

8. **Update Global Transformer**

   - File: `client-vue/src/utils/transformers/fetchToGlobalTransformer.ts`
   - Add `fetchPooledInstances()` method
   - Transform pooled instances in `stageForHydration()`
   - Attach `pooledMembers` arrays to entities in `hydrate()`

9. **Create Pooling Aggregator**

   - File: `client-vue/src/utils/transformers/poolingAggregator.ts`
   - `aggregatePoolProperties()` - aggregates properties from pool members at query time
   - `aggregatePartProfiles()` - aggregates part profile fees/times across pooled block profiles
   - `getPoolMembersRecursive()` - handles hierarchical pooling
   - Property aggregation strategies: sum (fees/times), merge (arrays), first (name), every (booleans)
   - **Computed view pattern**: Always recalculate from members, no stored values

10. **Update GlobalData Type**

    - File: `client-vue/src/utils/transformers/fetchToGlobalTransformer.ts`
    - Add `pooledInstances: Record<GlobalEntityKey, PooledInstance[]>` to `GlobalData`

### Phase 4: Composables & CRUD

11. **Create usePooledEntity Composable**

    - File: `client-vue/src/composables/usePooledEntity.ts`
    - `getPooledEntity(entityKey, entityId)` - returns computed aggregated entity (always recalculates)
    - `getPoolMembers(entityKey, masterId)` - returns pool members
    - `createPool(entityKey, masterId, memberIds)` - creates pool
    - `addToPool(entityKey, masterId, memberId)` - adds member
    - `removeFromPool(entityKey, masterId, memberId)` - removes member
    - `updateMasterWithDistribution(entityKey, masterId, changes, distributionStrategy)` - updates master and distributes to members via modal
    - Uses Vue Query for caching (invalidates when members change)

12. **Add Pooling to useEntityCrud**

    - File: `client-vue/src/composables/useEntity.ts`
    - Add methods to manage pool relationships
    - Invalidate cache when pool membership changes
    - Detect when editing computed properties on pool master
    - Trigger distribution modal for master changes

### Phase 5: UI Components & Integration

13. **Create Master Change Distribution Modal**

    - File: `client-vue/src/components/admin/pooling/MasterChangeDistributionModal.vue` (NEW)
    - Triggered when user edits computed properties on pool master
    - Options: proportional distribution, equal distribution, manual per-member
    - Shows preview of how changes will be distributed
    - Confirms distribution to all pool members

14. **Update Admin Transformer** (if needed)

    - File: `client-vue/src/utils/transformers/globalToAdminTransformer.ts`
    - Ensure pooled entities are properly transformed for admin UI

15. **Update Scheduler Transformer** (if needed)

    - File: `client/src/scheduler/dataTransformation/globalToSchedulerTransformer.ts`
    - Handle pooled entities in scheduler data transformation
    - Aggregate part profiles from pooled block profiles

16. **Add Example Configuration**

    - Configure `blockProfile` with pooling enabled
    - Add aggregation rules: `baseFee` (sum), `baseTime` (sum), `activeParts` (merge), `onSite` (every)

## Key Files to Modify

### Backend

- `server/src/db/models/scheduler/pooled_instance.ts` (NEW)
- `server/src/db/models/index.ts` (MODIFY - add PooledInstance)
- `server/src/config/entityRegistry.ts` (MODIFY - add pooling config)
- `server/src/routes/internal/pooledInstances/pooledInstanceRouter.ts` (NEW)
- `server/src/routes/internal/index.ts` (MODIFY - register routes)

### Frontend

- `client-vue/src/types/pooling.ts` (NEW)
- `client-vue/src/constants/pooling.ts` (NEW)
- `client-vue/src/types/entities.ts` (MODIFY - add pooling fields)
- `client-vue/src/utils/transformers/fetchToGlobalTransformer.ts` (MODIFY)
- `client-vue/src/utils/transformers/poolingAggregator.ts` (NEW)
- `client-vue/src/composables/usePooledEntity.ts` (NEW)
- `client-vue/src/composables/useEntity.ts` (MODIFY - add pool methods)
- `client-vue/src/components/admin/pooling/MasterChangeDistributionModal.vue` (NEW)

## Considerations

1. **Circular Reference Prevention**: Validate that adding a pool member doesn't create circular references (A pools B, B pools A)

2. **Hierarchical Aggregation**: When aggregating, recursively resolve pool members that are themselves pool composites

3. **Property Aggregation Strategies**:

   - `sum`: Numeric addition for fees/times (e.g., `baseFee`, `baseTime`, `rateOverBaseFee`)
   - `merge`: Array concatenation (e.g., `activeParts` - combine all part profiles)
   - `first`: Use first member's value (e.g., `name`, `description`)
   - `every`: Boolean AND (all must be true, e.g., `onSite`, `clientPresent`)
   - `custom`: Entity-specific aggregation function

4. **Computed View Pattern**: 

   - Masters are always computed from members at query time
   - No stored aggregated values in database
   - Changes to members automatically reflect in master (no sync needed)

5. **Master Change Distribution**:

   - When user edits master's computed properties, show modal
   - Distribution strategies: proportional (by current values), equal (split evenly), manual (user specifies per member)
   - Apply changes to all pool member part profiles accordingly

6. **Part Profile Aggregation**:

   - When pooling block profiles, aggregate all part profiles from all pooled blocks
   - Sum fees/times, merge arrays, combine booleans using `every`

7. **Performance**: Cache computed values in Vue Query, invalidate when pool members change

8. **UI Integration**: 

   - Pooled entities appear as single entities in lists
   - Show composition when editing (list pool members)
   - Indicate computed properties vs editable properties
   - Show distribution modal when editing computed properties

9. **Migration**: Existing entities won't have pools - this is additive functionality

## Testing Strategy

1. Unit tests for aggregation logic (sum, merge, first, every)
2. Unit tests for hierarchical pooling (recursive aggregation)
3. Unit tests for distribution strategies (proportional, equal, manual)
4. Integration tests for API endpoints
5. E2E tests for pool creation and aggregation
6. Test hierarchical pooling scenarios
7. Test circular reference prevention
8. Test master change distribution modal
9. Test part profile aggregation across pooled blocks