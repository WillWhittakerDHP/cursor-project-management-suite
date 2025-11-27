# Phase 4: Vuexy Integration Plan

**Date:** 2025-01-18
**Status:** In Progress

## Overview

Integrating Vuexy admin template (Vue 3 TypeScript full-version) into our existing Vue app while preserving our data layer (API clients, Pinia stores, composables).

## Strategy

**Approach:** Incremental integration
- Copy Vuexy core structure (@core, @layouts)
- Set up plugin registration system
- Configure path aliases and theme config
- Integrate with existing app structure
- Preserve existing data layer

## Integration Steps

### Step 1: Core Structure Setup ✅
- [x] Copy @core directory structure
- [x] Copy @layouts directory structure  
- [x] Set up path aliases (@core, @layouts, @themeConfig)
- [x] Create themeConfig.ts

### Step 2: Plugin System Setup
- [ ] Copy plugin registration utility
- [ ] Set up Vuexy plugins (router, pinia, vuetify, layouts)
- [ ] Integrate with existing plugins (Vue Query)

### Step 3: App Integration
- [ ] Update main.ts to use Vuexy plugin system
- [ ] Update App.vue to use Vuexy layout system
- [ ] Update router to work with Vuexy layouts

### Step 4: Data Layer Integration
- [ ] Verify API clients work with Vuexy components
- [ ] Test Pinia stores in Vuexy context
- [ ] Verify composables functional

### Step 5: Entity Management Pages
- [ ] Create BlockType page with Vuexy components
- [ ] Create BlockProfile page with Vuexy components
- [ ] Create PartType page with Vuexy components
- [ ] Create PartProfile page with Vuexy components

## Files to Copy from Vuexy Template

**Core Structure:**
- `src/@core/` - Core utilities, components, stores
- `src/@layouts/` - Layout system, navigation components
- `src/layouts/` - Layout components (default.vue, blank.vue)
- `src/components/` - Shared components (AppLoadingIndicator, etc.)
- `src/assets/styles/` - SCSS styles and variables
- `src/plugins/` - Plugin registration system

**Configuration:**
- `themeConfig.ts` - Theme and layout configuration
- Update `vite.config.ts` - Add path aliases
- Update `tsconfig.json` - Add path mappings

## Key Considerations

1. **Preserve Existing Data Layer:** Keep our API clients, Pinia stores, and composables intact
2. **Merge Plugin Systems:** Integrate Vuexy's plugin system with our Vue Query setup
3. **Path Aliases:** Set up @core, @layouts, @themeConfig aliases
4. **Layout System:** Use Vuexy's layout system for admin pages
5. **Styling:** Use Vuexy's SCSS structure for consistent theming

## Dependencies

- Vuexy template: `/Users/districthomepro/Desktop/vuexy-admin-v10.10.0/vue-version/typescript-version/full-version/`
- Our app: `/Users/districthomepro/Bonsai/Differential_Scheduler/client-vue/`

## Notes

- Vuexy uses Vuetify 3.10.8, we're using 3.10.9 (compatible)
- Vuexy uses Pinia (we already have it)
- Vuexy uses Vue Router (we already have it)
- Need to integrate Vue Query with Vuexy's plugin system

