# Session 4.2 Guide: Profiles Tab Implementation

**Purpose:** Session-level guide for building Profiles tab with BlockProfile grouping and nested PartProfiles

**Tier:** Session (Tier 3 - Detailed Implementation)

**Phase:** 4 - Vuexy Admin Panel Integration
**Session:** 4.2
**Status:** Not Started

---

## Session Overview

**Session Number:** 4.2
**Session Name:** Profiles Tab Implementation
**Description:** Build Profiles tab with BlockProfile management grouped by BlockType, displaying nested PartProfiles within each BlockProfile using activeParts relationship.

**Duration:** Estimated 3-4 hours
**Dependencies:** Session 4.1 complete (main admin panel structure)

---

## Session Objectives

- Implement ProfilesTab.vue with BlockProfile grouping
- Create BlockProfileCard.vue component
- Create PartProfileNestedList.vue component
- Integrate useGlobalComp and useRelationshipCrud composables
- Add search functionality
- Test data loading and display

---

## Key Deliverables

- Fully functional ProfilesTab.vue
- BlockProfileCard.vue component
- PartProfileNestedList.vue component
- Data integration with composables
- Search functionality
- Working nested PartProfile display

---

## Detailed Task Breakdown

### Task 4.2.1: Create ProfilesTab.vue Component Structure

**File:** `client-vue/src/views/admin/tabs/ProfilesTab.vue`

**Steps:**
1. Replace placeholder content with full component structure
2. Import necessary composables: `useGlobalComp`, `useRelationshipCrud`
3. Import Vuexy components: `VExpansionPanels`, `VExpansionPanel`, `VCard`, `VTextField`
4. Set up reactive state for search and expanded groups
5. Create computed properties for grouped BlockProfiles
6. Add search input field
7. Add VExpansionPanels for BlockType groups

**Code Structure:**
```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGlobalComp } from '@/composables/useGlobalComp'
import { useRelationshipCrud } from '@/composables/useRelationship'
import BlockProfileCard from '../components/BlockProfileCard.vue'

const { getGlobalEntities } = useGlobalComp()
const { relationships: activeParts } = useRelationshipCrud('activeParts')

const searchTerm = ref('')
const expandedGroups = ref<string[]>([])

// Group BlockProfiles by BlockType
const groupedProfiles = computed(() => {
  const blockTypes = getGlobalEntities('blockType')
  const blockProfiles = getGlobalEntities('blockProfile')
  
  // Grouping logic here
  // Return array of { blockType, profiles: BlockProfile[] }
})
</script>

<template>
  <div class="profiles-tab">
    <!-- Search -->
    <VTextField
      v-model="searchTerm"
      placeholder="Search BlockProfiles..."
      prepend-inner-icon="tabler-search"
      class="mb-4"
    />
    
    <!-- BlockType Groups -->
    <VExpansionPanels v-model="expandedGroups" multiple>
      <VExpansionPanel
        v-for="group in groupedProfiles"
        :key="group.blockType.id"
        :value="group.blockType.id"
      >
        <template #title>
          {{ group.blockType.name }} ({{ group.profiles.length }})
        </template>
        
        <template #text>
          <BlockProfileCard
            v-for="profile in group.profiles"
            :key="profile.id"
            :block-profile="profile"
          />
        </template>
      </VExpansionPanel>
    </VExpansionPanels>
  </div>
</template>
```

**Learning Points:**
- VExpansionPanels for grouping
- Computed properties for reactive data transformation
- Integration with composables

---

### Task 4.2.2: Implement BlockProfile Grouping by BlockType

**File:** `client-vue/src/views/admin/tabs/ProfilesTab.vue`

**Steps:**
1. Create computed property `groupedProfiles`
2. Get BlockTypes and BlockProfiles from `useGlobalComp()`
3. Group BlockProfiles by `blockTypeRef` property
4. Filter groups by search term (search BlockType name and BlockProfile names)
5. Sort groups by BlockType `orderIndex`
6. Sort BlockProfiles within each group by `orderIndex`

**Grouping Logic:**
```typescript
const groupedProfiles = computed(() => {
  const blockTypes = getGlobalEntities('blockType')
  const blockProfiles = getGlobalEntities('blockProfile')
  
  // Create map of BlockType ID -> BlockProfile[]
  const groupMap = new Map<string, {
    blockType: GlobalEntity<'blockType'>
    profiles: GlobalEntity<'blockProfile'>[]
  }>()
  
  // Initialize groups for all BlockTypes
  blockTypes.forEach(blockType => {
    groupMap.set(blockType.id, {
      blockType,
      profiles: []
    })
  })
  
  // Add BlockProfiles to their groups
  blockProfiles.forEach(profile => {
    const group = groupMap.get(profile.blockTypeRef)
    if (group) {
      group.profiles.push(profile)
    }
  })
  
  // Filter by search term
  let filtered = Array.from(groupMap.values())
  if (searchTerm.value) {
    const term = searchTerm.value.toLowerCase()
    filtered = filtered
      .map(group => ({
        ...group,
        profiles: group.profiles.filter(p => 
          p.name.toLowerCase().includes(term)
        )
      }))
      .filter(group => 
        group.blockType.name.toLowerCase().includes(term) ||
        group.profiles.length > 0
      )
  }
  
  // Sort groups and profiles
  return filtered
    .sort((a, b) => a.blockType.orderIndex - b.blockType.orderIndex)
    .map(group => ({
      ...group,
      profiles: group.profiles.sort((a, b) => a.orderIndex - b.orderIndex)
    }))
})
```

**Learning Points:**
- Map data structure for grouping
- Computed property with complex logic
- Search filtering across nested data

---

### Task 4.2.3: Create BlockProfileCard.vue Component

**File:** `client-vue/src/views/admin/components/BlockProfileCard.vue`

**Steps:**
1. Create components directory if needed
2. Create BlockProfileCard.vue component
3. Accept `blockProfile` as prop
4. Display BlockProfile properties:
   - Name (prominent)
   - Description
   - baseSqFt
   - visibility status
   - disabled status
5. Add action buttons: Edit, Delete
6. Include PartProfileNestedList component
7. Use Vuexy VCard for layout

**Code Structure:**
```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { GlobalEntity } from '@/types/entities'
import PartProfileNestedList from './PartProfileNestedList.vue'

interface Props {
  blockProfile: GlobalEntity<'blockProfile'>
}

const props = defineProps<Props>()

const isExpanded = ref(false)
</script>

<template>
  <VCard class="mb-4">
    <VCardTitle>
      <div class="d-flex align-center justify-space-between">
        <span>{{ blockProfile.name }}</span>
        <div>
          <VBtn
            icon="tabler-edit"
            variant="text"
            size="small"
            @click="editBlockProfile"
          />
          <VBtn
            icon="tabler-trash"
            variant="text"
            size="small"
            color="error"
            @click="deleteBlockProfile"
          />
        </div>
      </div>
    </VCardTitle>
    
    <VCardText>
      <div v-if="blockProfile.description" class="mb-2">
        {{ blockProfile.description }}
      </div>
      
      <div class="d-flex gap-4 mb-4">
        <VChip size="small" v-if="blockProfile.baseSqFt">
          Base SqFt: {{ blockProfile.baseSqFt }}
        </VChip>
        <VChip
          size="small"
          :color="blockProfile.visibility ? 'success' : 'default'"
        >
          {{ blockProfile.visibility ? 'Visible' : 'Hidden' }}
        </VChip>
        <VChip
          size="small"
          :color="blockProfile.disabled ? 'error' : 'success'"
        >
          {{ blockProfile.disabled ? 'Disabled' : 'Active' }}
        </VChip>
      </div>
      
      <!-- Nested PartProfiles -->
      <PartProfileNestedList :block-profile-id="blockProfile.id" />
    </VCardText>
  </VCard>
</template>
```

**Learning Points:**
- Component props and TypeScript types
- Vuexy VCard layout patterns
- Action buttons with icons

---

### Task 4.2.4: Create PartProfileNestedList.vue Component

**File:** `client-vue/src/views/admin/components/PartProfileNestedList.vue`

**Steps:**
1. Create PartProfileNestedList.vue component
2. Accept `blockProfileId` as prop
3. Use `useRelationshipCrud('activeParts')` to get relationships
4. Filter relationships where `parent_id === blockProfileId`
5. Get PartProfile entities for those relationships
6. Display PartProfiles in VList or VExpansionPanel
7. Show PartProfile properties: name, baseTime, baseFee, etc.
8. Add actions: Edit PartProfile, Remove from BlockProfile
9. Add "Add PartProfile" button

**Code Structure:**
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useGlobalComp } from '@/composables/useGlobalComp'
import { useRelationshipCrud } from '@/composables/useRelationship'
import type { GlobalEntity } from '@/types/entities'

interface Props {
  blockProfileId: string
}

const props = defineProps<Props>()

const { getGlobalEntities, getGlobalEntityById } = useGlobalComp()
const { relationships: activeParts, remove } = useRelationshipCrud('activeParts')

// Get PartProfiles for this BlockProfile
const partProfiles = computed(() => {
  const allPartProfiles = getGlobalEntities('partProfile')
  const relationships = activeParts.value.filter(
    rel => rel.parent_id === props.blockProfileId && !rel.disabled
  )
  
  return relationships
    .map(rel => getGlobalEntityById('partProfile', rel.child_id))
    .filter((pp): pp is GlobalEntity<'partProfile'> => pp !== undefined)
    .sort((a, b) => a.orderIndex - b.orderIndex)
})

const removePartProfile = async (partProfileId: string) => {
  await remove(props.blockProfileId, partProfileId)
}
</script>

<template>
  <div class="part-profiles-nested">
    <div class="d-flex align-center justify-space-between mb-2">
      <VSubheader>Part Profiles ({{ partProfiles.length }})</VSubheader>
      <VBtn
        size="small"
        prepend-icon="tabler-plus"
        @click="addPartProfile"
      >
        Add PartProfile
      </VBtn>
    </div>
    
    <VList v-if="partProfiles.length > 0">
      <VListItem
        v-for="partProfile in partProfiles"
        :key="partProfile.id"
      >
        <VListItemTitle>{{ partProfile.name }}</VListItemTitle>
        <VListItemSubtitle>
          Base Time: {{ partProfile.baseTime }} | Base Fee: ${{ partProfile.baseFee }}
        </VListItemSubtitle>
        <template #append>
          <VBtn
            icon="tabler-edit"
            variant="text"
            size="small"
            @click="editPartProfile(partProfile.id)"
          />
          <VBtn
            icon="tabler-x"
            variant="text"
            size="small"
            color="error"
            @click="removePartProfile(partProfile.id)"
          />
        </template>
      </VListItem>
    </VList>
    
    <VAlert
      v-else
      type="info"
      variant="tonal"
      class="mt-2"
    >
      No PartProfiles assigned to this BlockProfile
    </VAlert>
  </div>
</template>
```

**Learning Points:**
- Relationship filtering and lookup
- VList for nested items
- Relationship CRUD operations

---

### Task 4.2.5: Integrate Composables

**File:** `client-vue/src/views/admin/tabs/ProfilesTab.vue`

**Steps:**
1. Import `useGlobalComp` composable
2. Import `useRelationshipCrud` composable
3. Call composables in setup
4. Use `getGlobalEntities()` to get BlockTypes, BlockProfiles, PartProfiles
5. Use `useRelationshipCrud('activeParts')` to get activeParts relationships
6. Handle loading states
7. Handle error states

**Integration Code:**
```typescript
import { useGlobalComp } from '@/composables/useGlobalComp'
import { useRelationshipCrud } from '@/composables/useRelationship'

const { getGlobalEntities, getGlobalEntityById } = useGlobalComp()
const { 
  relationships: activeParts, 
  isLoading: isLoadingRelationships,
  error: relationshipError 
} = useRelationshipCrud('activeParts')

// Use in computed properties and methods
```

**Learning Points:**
- Composable integration patterns
- Loading and error state handling

---

### Task 4.2.6: Add Search Functionality

**File:** `client-vue/src/views/admin/tabs/ProfilesTab.vue`

**Steps:**
1. Add `searchTerm` ref
2. Add VTextField for search input
3. Update `groupedProfiles` computed to filter by search term
4. Search should match:
   - BlockType names
   - BlockProfile names
   - BlockProfile descriptions
5. Show "No results" message when filtered list is empty

**Search Implementation:**
```vue
<template>
  <VTextField
    v-model="searchTerm"
    placeholder="Search BlockProfiles by name, type, or description..."
    prepend-inner-icon="tabler-search"
    clearable
    class="mb-4"
  />
</template>
```

**Filtering Logic:**
```typescript
// In groupedProfiles computed property
if (searchTerm.value) {
  const term = searchTerm.value.toLowerCase()
  filtered = filtered
    .map(group => ({
      ...group,
      profiles: group.profiles.filter(p => 
        p.name.toLowerCase().includes(term) ||
        (p.description && p.description.toLowerCase().includes(term))
      )
    }))
    .filter(group => 
      group.blockType.name.toLowerCase().includes(term) ||
      group.profiles.length > 0
    )
}
```

**Learning Points:**
- Search input with Vuexy components
- Multi-field search filtering

---

### Task 4.2.7: Test Data Loading and Display

**Steps:**
1. Start dev server
2. Navigate to `/admin` and Profiles tab
3. Verify BlockProfiles load and group correctly
4. Verify nested PartProfiles display
5. Test search functionality
6. Test expanding/collapsing groups
7. Verify loading states
8. Check browser console for errors
9. Test with empty data states

**Testing Checklist:**
- [ ] BlockProfiles load from API
- [ ] BlockProfiles group correctly by BlockType
- [ ] Nested PartProfiles display within BlockProfiles
- [ ] Search filters correctly
- [ ] Expansion panels work
- [ ] Loading states display
- [ ] Empty states display correctly
- [ ] No console errors
- [ ] Data updates reactively

---

## Vuexy Components Used

- `VExpansionPanels` - Container for expandable groups
- `VExpansionPanel` - Individual BlockType group
- `VCard` - BlockProfile card container
- `VCardTitle` - Card title
- `VCardText` - Card content
- `VTextField` - Search input
- `VList` - PartProfile list
- `VListItem` - Individual PartProfile item
- `VListItemTitle` - PartProfile name
- `VListItemSubtitle` - PartProfile details
- `VBtn` - Action buttons
- `VChip` - Status badges
- `VSubheader` - Section headers
- `VAlert` - Empty state message

---

## File Structure Created

```
client-vue/src/views/admin/
├── tabs/
│   └── ProfilesTab.vue (UPDATED - full implementation)
└── components/
    ├── BlockProfileCard.vue (NEW)
    └── PartProfileNestedList.vue (NEW)
```

---

## Success Criteria

- [ ] ProfilesTab.vue fully implemented
- [ ] BlockProfileCard.vue component created
- [ ] PartProfileNestedList.vue component created
- [ ] BlockProfiles group correctly by BlockType
- [ ] Nested PartProfiles display correctly
- [ ] Search functionality works
- [ ] Composables integrated correctly
- [ ] Data loads and displays correctly
- [ ] Ready for Session 4.3 (Types Tab Implementation)

---

## Notes

- Focus on data display first, CRUD operations come in Session 4.4
- Ensure relationship data loads correctly
- Handle edge cases (empty groups, no PartProfiles, etc.)
- Use Vuexy styling consistently

---

## Related Documents

- Phase Guide: `.cursor/project-manager/features/vue-migration/phases/phase-4-guide.md`
- Project Plan: `.cursor/project-manager/PROJECT_PLAN.md`
- Plan Details: `plan.plan.md`
- Session 4.1 Guide: `.cursor/project-manager/features/vue-migration/sessions/session-4.1-guide.md`

