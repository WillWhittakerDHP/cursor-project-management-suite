/**
 * Plugin registry: register plugins, get sorted by spec, validate (charter §7.5).
 * Max 8 plugins; getForSpec returns plugins that apply to the spec, sorted by priority.
 */

import type { WorkflowSpec, PolicyPlugin, PluginRegistry } from './contracts';

const MAX_PLUGINS = 8;

export function createPluginRegistry(): PluginRegistry {
  const plugins: PolicyPlugin[] = [];

  return {
    register(plugin: PolicyPlugin): void {
      if (!plugin.capabilities?.length) {
        throw new Error(`Plugin ${plugin.name} must declare capabilities.`);
      }
      plugins.push(plugin);
    },

    getForSpec(spec: WorkflowSpec): PolicyPlugin[] {
      return plugins
        .filter((p) => p.appliesTo(spec))
        .slice()
        .sort((a, b) => a.priority - b.priority);
    },

    validate(): void {
      if (plugins.length > MAX_PLUGINS) {
        throw new Error(
          `Plugin registry: maximum ${MAX_PLUGINS} plugins allowed; got ${plugins.length}.`
        );
      }
      for (const p of plugins) {
        if (!Array.isArray(p.capabilities) || p.capabilities.length === 0) {
          throw new Error(`Plugin ${p.name} must declare at least one capability.`);
        }
      }
    },
  };
}
