# Session 4.4 Guide: Form Dialogs and CRUD Operations

**Purpose:** Session-level guide for creating form dialogs and implementing full CRUD operations

**Tier:** Session (Tier 3 - Detailed Implementation)

**Phase:** 4 - Vuexy Admin Panel Integration
**Session:** 4.4
**Status:** Not Started

---

## Session Overview

**Session Number:** 4.4
**Session Name:** Form Dialogs and CRUD Operations
**Description:** Create form dialogs for all entity types using Vuexy form components. Implement create/edit mutations and delete operations. Add relationship management (activeParts) in dialogs.

**Duration:** Estimated 4-5 hours
**Dependencies:** Sessions 4.1, 4.2, 4.3 complete

---

## Session Objectives

- Create form dialogs for all entity types
- Implement create/edit mutations
- Implement delete operations
- Add relationship management in BlockProfile dialog
- Integrate API clients and mutations
- Test full CRUD operations
- Apply Vuexy styling and polish

---

## Key Deliverables

- BlockProfileDialog.vue with form and relationship management
- PartProfileDialog.vue with form
- BlockTypeDialog.vue with form
- PartTypeDialog.vue with form
- Full CRUD operations working
- Relationship management working
- Polished UI with Vuexy styling

---

## Detailed Task Breakdown

### Task 4.4.1: Create BlockProfileDialog.vue

**File:** `client-vue/src/views/admin/dialogs/BlockProfileDialog.vue`

**Steps:**
1. Create dialogs directory if needed
2. Create BlockProfileDialog.vue component
3. Accept props: `modelValue` (boolean for dialog visibility), `blockProfile` (optional, for edit mode)
4. Use VDialog component from Vuexy
5. Create form with Vuexy form components:
   - AppTextField for: name, description, baseSqFt, icon
   - AppSelect for: blockTypeRef (select from BlockTypes)
   - AppCheckbox for: visibility, disabled
6. Add form validation
7. Handle create vs edit mode
8. Add relationship management section for activeParts
9. Add save/cancel buttons
10. Emit events: `update:modelValue`, `saved`

**Code Structure:**
```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useGlobalComp } from '@/composables/useGlobalComp'
import { useRelationshipCrud } from '@/composables/useRelationship'
import { useEntityCrud } from '@/composables/useEntity'
import type { GlobalEntity } from '@/types/entities'

interface Props {
  modelValue: boolean
  blockProfile?: GlobalEntity<'blockProfile'>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const { getGlobalEntities } = useGlobalComp()
const { create: createRelationship, remove: removeRelationship } = useRelationshipCrud('activeParts')
const { create: createEntity, update: updateEntity } = useEntityCrud('blockProfile')

const isEditMode = computed(() => !!props.blockProfile)

const formData = ref({
  name: '',
  description: '',
  baseSqFt: null as number | null,
  icon: '',
  blockTypeRef: '',
  visibility: true,
  disabled: false,
})

const selectedPartProfileIds = ref<string[]>([])

const blockTypes = computed(() => getGlobalEntities('blockType'))
const allPartProfiles = computed(() => getGlobalEntities('partProfile'))
const availablePartProfiles = computed(() => 
  allPartProfiles.value.filter(pp => !pp.disabled)
)

// Initialize form data
watch(() => props.blockProfile, (profile) => {
  if (profile) {
    formData.value = {
      name: profile.name,
      description: profile.description,
      baseSqFt: profile.baseSqFt,
      icon: profile.icon || '',
      blockTypeRef: profile.blockTypeRef,
      visibility: profile.visibility,
      disabled: profile.disabled,
    }
    // Load existing activeParts relationships
    loadActiveParts(profile.id)
  } else {
    resetForm()
  }
}, { immediate: true })

const loadActiveParts = async (blockProfileId: string) => {
  const { relationships } = useRelationshipCrud('activeParts')
  const activeParts = relationships.value.filter(
    rel => rel.parent_id === blockProfileId && !rel.disabled
  )
  selectedPartProfileIds.value = activeParts.map(rel => rel.child_id)
}

const resetForm = () => {
  formData.value = {
    name: '',
    description: '',
    baseSqFt: null,
    icon: '',
    blockTypeRef: '',
    visibility: true,
    disabled: false,
  }
  selectedPartProfileIds.value = []
}

const save = async () => {
  try {
    if (isEditMode.value && props.blockProfile) {
      // Update existing
      await updateEntity(props.blockProfile.id, formData.value)
      
      // Update relationships
      await updateRelationships(props.blockProfile.id)
    } else {
      // Create new
      const newBlockProfile = await createEntity(formData.value)
      
      // Create relationships
      await updateRelationships(newBlockProfile.id)
    }
    
    emit('saved')
    emit('update:modelValue', false)
  } catch (error) {
    console.error('Error saving BlockProfile:', error)
  }
}

const updateRelationships = async (blockProfileId: string) => {
  const { relationships } = useRelationshipCrud('activeParts')
  const existingRelationships = relationships.value.filter(
    rel => rel.parent_id === blockProfileId && !rel.disabled
  )
  const existingPartProfileIds = existingRelationships.map(rel => rel.child_id)
  
  // Remove relationships that are no longer selected
  for (const rel of existingRelationships) {
    if (!selectedPartProfileIds.value.includes(rel.child_id)) {
      await removeRelationship(blockProfileId, rel.child_id)
    }
  }
  
  // Add new relationships
  for (const partProfileId of selectedPartProfileIds.value) {
    if (!existingPartProfileIds.includes(partProfileId)) {
      await createRelationship({
        parent_type: 'blockProfile',
        child_type: 'partProfile',
        parent_id: blockProfileId,
        child_id: partProfileId,
      })
    }
  }
}

const close = () => {
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="800"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard>
      <VCardTitle>
        {{ isEditMode ? 'Edit BlockProfile' : 'Create BlockProfile' }}
      </VCardTitle>
      
      <VCardText>
        <VForm>
          <AppTextField
            v-model="formData.name"
            label="Name"
            required
            class="mb-4"
          />
          
          <AppTextarea
            v-model="formData.description"
            label="Description"
            class="mb-4"
          />
          
          <AppTextField
            v-model.number="formData.baseSqFt"
            label="Base Square Feet"
            type="number"
            class="mb-4"
          />
          
          <AppTextField
            v-model="formData.icon"
            label="Icon"
            class="mb-4"
          />
          
          <AppSelect
            v-model="formData.blockTypeRef"
            :items="blockTypes"
            item-title="name"
            item-value="id"
            label="Block Type"
            required
            class="mb-4"
          />
          
          <div class="d-flex gap-4 mb-4">
            <AppCheckbox
              v-model="formData.visibility"
              label="Visible"
            />
            <AppCheckbox
              v-model="formData.disabled"
              label="Disabled"
            />
          </div>
          
          <!-- PartProfiles Relationship Management -->
          <VCard variant="outlined" class="mb-4">
            <VCardTitle class="text-h6">Part Profiles</VCardTitle>
            <VCardText>
              <AppSelect
                v-model="selectedPartProfileIds"
                :items="availablePartProfiles"
                item-title="name"
                item-value="id"
                label="Select PartProfiles"
                multiple
                chips
              />
            </VCardText>
          </VCard>
        </VForm>
      </VCardText>
      
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="close">Cancel</VBtn>
        <VBtn color="primary" @click="save">Save</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
```

**Learning Points:**
- VDialog component usage
- Form data management
- Create vs edit mode handling
- Relationship management in forms
- Form validation

---

### Task 4.4.2: Create PartProfileDialog.vue

**File:** `client-vue/src/views/admin/dialogs/PartProfileDialog.vue`

**Steps:**
1. Create PartProfileDialog.vue component
2. Similar structure to BlockProfileDialog but simpler
3. Form fields:
   - AppTextField: name, baseTime, rateOverBaseTime, baseFee, rateOverBaseFee
   - AppSelect: partTypeRef (select from PartTypes)
   - AppCheckbox: onSite, clientPresent, moveable, disabled
4. Handle create/edit mode
5. Add save/cancel buttons
6. Integrate mutations

**Code Structure:**
```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useGlobalComp } from '@/composables/useGlobalComp'
import { useEntityCrud } from '@/composables/useEntity'
import type { GlobalEntity } from '@/types/entities'

interface Props {
  modelValue: boolean
  partProfile?: GlobalEntity<'partProfile'>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const { getGlobalEntities } = useGlobalComp()
const { create: createEntity, update: updateEntity } = useEntityCrud('partProfile')

const isEditMode = computed(() => !!props.partProfile)

const formData = ref({
  name: '',
  partTypeRef: '',
  onSite: true,
  clientPresent: false,
  moveable: false,
  baseTime: 0,
  rateOverBaseTime: 0,
  baseFee: 0,
  rateOverBaseFee: 0,
  disabled: false,
})

const partTypes = computed(() => getGlobalEntities('partType'))

// Initialize form data
watch(() => props.partProfile, (profile) => {
  if (profile) {
    formData.value = {
      name: profile.name,
      partTypeRef: profile.partTypeRef,
      onSite: profile.onSite,
      clientPresent: profile.clientPresent,
      moveable: profile.moveable,
      baseTime: profile.baseTime,
      rateOverBaseTime: profile.rateOverBaseTime,
      baseFee: profile.baseFee,
      rateOverBaseFee: profile.rateOverBaseFee,
      disabled: profile.disabled,
    }
  } else {
    resetForm()
  }
}, { immediate: true })

const resetForm = () => {
  formData.value = {
    name: '',
    partTypeRef: '',
    onSite: true,
    clientPresent: false,
    moveable: false,
    baseTime: 0,
    rateOverBaseTime: 0,
    baseFee: 0,
    rateOverBaseFee: 0,
    disabled: false,
  }
}

const save = async () => {
  try {
    if (isEditMode.value && props.partProfile) {
      await updateEntity(props.partProfile.id, formData.value)
    } else {
      await createEntity(formData.value)
    }
    
    emit('saved')
    emit('update:modelValue', false)
  } catch (error) {
    console.error('Error saving PartProfile:', error)
  }
}

const close = () => {
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="600"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard>
      <VCardTitle>
        {{ isEditMode ? 'Edit PartProfile' : 'Create PartProfile' }}
      </VCardTitle>
      
      <VCardText>
        <VForm>
          <AppTextField
            v-model="formData.name"
            label="Name"
            required
            class="mb-4"
          />
          
          <AppSelect
            v-model="formData.partTypeRef"
            :items="partTypes"
            item-title="name"
            item-value="id"
            label="Part Type"
            required
            class="mb-4"
          />
          
          <div class="d-flex gap-4 mb-4">
            <AppCheckbox
              v-model="formData.onSite"
              label="On Site"
            />
            <AppCheckbox
              v-model="formData.clientPresent"
              label="Client Present"
            />
            <AppCheckbox
              v-model="formData.moveable"
              label="Moveable"
            />
            <AppCheckbox
              v-model="formData.disabled"
              label="Disabled"
            />
          </div>
          
          <AppTextField
            v-model.number="formData.baseTime"
            label="Base Time"
            type="number"
            class="mb-4"
          />
          
          <AppTextField
            v-model.number="formData.rateOverBaseTime"
            label="Rate Over Base Time"
            type="number"
            class="mb-4"
          />
          
          <AppTextField
            v-model.number="formData.baseFee"
            label="Base Fee"
            type="number"
            class="mb-4"
          />
          
          <AppTextField
            v-model.number="formData.rateOverBaseFee"
            label="Rate Over Base Fee"
            type="number"
            class="mb-4"
          />
        </VForm>
      </VCardText>
      
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="close">Cancel</VBtn>
        <VBtn color="primary" @click="save">Save</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
```

**Learning Points:**
- Simpler form structure
- Number input handling
- Multiple checkbox fields

---

### Task 4.4.3: Create BlockTypeDialog.vue

**File:** `client-vue/src/views/admin/dialogs/BlockTypeDialog.vue`

**Steps:**
1. Create BlockTypeDialog.vue component
2. Simple form with:
   - AppTextField: name, orderIndex
   - AppCheckbox: allowMultipleBlocks, allowMultipleParts, disabled
3. Handle create/edit mode
4. Integrate mutations

**Code Structure:**
```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEntityCrud } from '@/composables/useEntity'
import type { GlobalEntity } from '@/types/entities'

interface Props {
  modelValue: boolean
  blockType?: GlobalEntity<'blockType'>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const { create: createEntity, update: updateEntity } = useEntityCrud('blockType')

const isEditMode = computed(() => !!props.blockType)

const formData = ref({
  name: '',
  orderIndex: 0,
  allowMultipleBlocks: false,
  allowMultipleParts: false,
  disabled: false,
})

// Initialize form data
watch(() => props.blockType, (type) => {
  if (type) {
    formData.value = {
      name: type.name,
      orderIndex: type.orderIndex,
      allowMultipleBlocks: type.allowMultipleBlocks,
      allowMultipleParts: type.allowMultipleParts,
      disabled: type.disabled,
    }
  } else {
    resetForm()
  }
}, { immediate: true })

const resetForm = () => {
  formData.value = {
    name: '',
    orderIndex: 0,
    allowMultipleBlocks: false,
    allowMultipleParts: false,
    disabled: false,
  }
}

const save = async () => {
  try {
    if (isEditMode.value && props.blockType) {
      await updateEntity(props.blockType.id, formData.value)
    } else {
      await createEntity(formData.value)
    }
    
    emit('saved')
    emit('update:modelValue', false)
  } catch (error) {
    console.error('Error saving BlockType:', error)
  }
}

const close = () => {
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="500"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard>
      <VCardTitle>
        {{ isEditMode ? 'Edit BlockType' : 'Create BlockType' }}
      </VCardTitle>
      
      <VCardText>
        <VForm>
          <AppTextField
            v-model="formData.name"
            label="Name"
            required
            class="mb-4"
          />
          
          <AppTextField
            v-model.number="formData.orderIndex"
            label="Order Index"
            type="number"
            class="mb-4"
          />
          
          <div class="d-flex gap-4 mb-4">
            <AppCheckbox
              v-model="formData.allowMultipleBlocks"
              label="Allow Multiple Blocks"
            />
            <AppCheckbox
              v-model="formData.allowMultipleParts"
              label="Allow Multiple Parts"
            />
            <AppCheckbox
              v-model="formData.disabled"
              label="Disabled"
            />
          </div>
        </VForm>
      </VCardText>
      
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="close">Cancel</VBtn>
        <VBtn color="primary" @click="save">Save</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
```

**Learning Points:**
- Simple form structure
- Order index management

---

### Task 4.4.4: Create PartTypeDialog.vue

**File:** `client-vue/src/views/admin/dialogs/PartTypeDialog.vue`

**Steps:**
1. Create PartTypeDialog.vue component
2. Very simple form with:
   - AppTextField: name, orderIndex
   - AppCheckbox: disabled
3. Handle create/edit mode
4. Integrate mutations

**Code Structure:** (Similar to BlockTypeDialog but simpler - only name, orderIndex, disabled)

---

### Task 4.4.5: Integrate Create/Edit Mutations

**Steps:**
1. Import `useEntityCrud` composable in each dialog
2. Use `create` and `update` methods from composable
3. Handle API responses
4. Invalidate Vue Query cache after mutations
5. Handle errors appropriately
6. Show loading states during mutations
7. Show success/error messages

**Mutation Integration:**
```typescript
import { useEntityCrud } from '@/composables/useEntity'

const { create: createEntity, update: updateEntity, isLoading } = useEntityCrud('blockProfile')

const save = async () => {
  try {
    if (isEditMode.value) {
      await updateEntity(props.blockProfile.id, formData.value)
    } else {
      await createEntity(formData.value)
    }
    // Vue Query will automatically invalidate and refetch
    emit('saved')
    emit('update:modelValue', false)
  } catch (error) {
    // Handle error
  }
}
```

**Learning Points:**
- Mutation patterns with Vue Query
- Cache invalidation
- Error handling

---

### Task 4.4.6: Add Relationship Management in BlockProfile Dialog

**File:** `client-vue/src/views/admin/dialogs/BlockProfileDialog.vue`

**Steps:**
1. Add section for PartProfile selection
2. Use AppSelect with multiple selection
3. Load existing activeParts relationships
4. Update relationships on save
5. Handle adding/removing relationships

**Relationship Management:** (See Task 4.4.1 code example)

**Learning Points:**
- Relationship CRUD operations
- Multi-select component
- Relationship synchronization

---

### Task 4.4.7: Wire Up Dialogs to Components

**Steps:**
1. Add dialog state to ProfilesTab.vue
2. Add dialog state to BlockTypeSection.vue
3. Add dialog state to PartTypeSection.vue
4. Wire up create/edit buttons to open dialogs
5. Handle dialog close/save events
6. Refresh data after save

**Integration Example:**
```vue
<script setup lang="ts">
import { ref } from 'vue'
import BlockProfileDialog from '../dialogs/BlockProfileDialog.vue'
import type { GlobalEntity } from '@/types/entities'

const showDialog = ref(false)
const selectedBlockProfile = ref<GlobalEntity<'blockProfile'> | undefined>()

const createBlockProfile = () => {
  selectedBlockProfile.value = undefined
  showDialog.value = true
}

const editBlockProfile = (profile: GlobalEntity<'blockProfile'>) => {
  selectedBlockProfile.value = profile
  showDialog.value = true
}

const handleSaved = () => {
  // Data will refresh automatically via Vue Query
}
</script>

<template>
  <BlockProfileDialog
    v-model="showDialog"
    :block-profile="selectedBlockProfile"
    @saved="handleSaved"
  />
</template>
```

**Learning Points:**
- Dialog state management
- Component communication
- Data refresh patterns

---

### Task 4.4.8: Test Full CRUD Operations

**Steps:**
1. Test creating BlockProfile
2. Test editing BlockProfile
3. Test deleting BlockProfile
4. Test creating PartProfile
5. Test editing PartProfile
6. Test deleting PartProfile
7. Test creating BlockType
8. Test editing BlockType
9. Test deleting BlockType
10. Test creating PartType
11. Test editing PartType
12. Test deleting PartType
13. Test relationship management (adding/removing PartProfiles from BlockProfile)
14. Verify data persists in database
15. Verify UI updates correctly

**Testing Checklist:**
- [ ] All create operations work
- [ ] All edit operations work
- [ ] All delete operations work
- [ ] Relationship management works
- [ ] Data persists correctly
- [ ] UI updates reactively
- [ ] Error handling works
- [ ] Loading states display
- [ ] Success/error messages display

---

### Task 4.4.9: Apply Vuexy Styling and Polish

**Steps:**
1. Ensure consistent spacing and padding
2. Apply Vuexy color scheme
3. Add proper icons to buttons
4. Add loading states to buttons
5. Add success/error snackbars
6. Improve form validation messages
7. Add tooltips where helpful
8. Ensure responsive design
9. Polish empty states
10. Add transitions/animations

**Styling Considerations:**
- Use Vuexy spacing utilities (mb-4, gap-4, etc.)
- Use Vuexy color tokens
- Consistent button styles
- Proper form field spacing
- Card elevation and borders

**Learning Points:**
- Vuexy styling patterns
- UI polish techniques
- User experience improvements

---

## Vuexy Components Used

- `VDialog` - Dialog container
- `VCard` - Dialog card
- `VCardTitle` - Dialog title
- `VCardText` - Dialog content
- `VCardActions` - Dialog actions
- `VForm` - Form container
- `AppTextField` - Text input
- `AppTextarea` - Textarea input
- `AppSelect` - Select dropdown
- `AppCheckbox` - Checkbox input
- `VBtn` - Buttons
- `VSpacer` - Spacer
- `VSnackbar` - Success/error messages (optional)

---

## File Structure Created

```
client-vue/src/views/admin/
└── dialogs/
    ├── BlockProfileDialog.vue (NEW)
    ├── PartProfileDialog.vue (NEW)
    ├── BlockTypeDialog.vue (NEW)
    └── PartTypeDialog.vue (NEW)
```

---

## Success Criteria

- [ ] All form dialogs created
- [ ] Create operations work for all entities
- [ ] Edit operations work for all entities
- [ ] Delete operations work for all entities
- [ ] Relationship management works in BlockProfile dialog
- [ ] Data persists correctly
- [ ] UI updates reactively
- [ ] Error handling works
- [ ] Loading states display
- [ ] Vuexy styling applied consistently
- [ ] Phase 4 complete and ready for Phase 5

---

## Notes

- Focus on functionality first, then polish
- Ensure all mutations properly invalidate cache
- Handle edge cases (validation, errors, empty states)
- Test thoroughly before moving to Phase 5
- Document any issues or patterns discovered

---

## Related Documents

- Phase Guide: `.cursor/project-manager/features/vue-migration/phases/phase-4-guide.md`
- Project Plan: `.cursor/project-manager/PROJECT_PLAN.md`
- Plan Details: `plan.plan.md`
- Session 4.1 Guide: `.cursor/project-manager/features/vue-migration/sessions/session-4.1-guide.md`
- Session 4.2 Guide: `.cursor/project-manager/features/vue-migration/sessions/session-4.2-guide.md`
- Session 4.3 Guide: `.cursor/project-manager/features/vue-migration/sessions/session-4.3-guide.md`

