/**
 * Default harness plugins for tier-start / tier-end kernel runs (fresh registry per invocation).
 */

import type { PluginRegistry } from './contracts';
import { DefaultPluginRegistry } from './plugin-registry';
import { ModelRecommendationPlugin } from './plugins/model-recommendation-plugin';

export function createDefaultPlugins(): PluginRegistry {
  const registry = new DefaultPluginRegistry();
  registry.register(new ModelRecommendationPlugin());
  registry.validate();
  return registry;
}
