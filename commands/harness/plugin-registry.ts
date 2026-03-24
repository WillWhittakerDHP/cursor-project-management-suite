/**
 * Default PluginRegistry: register plugins, filter by appliesTo, sort by priority (ascending).
 * Lower priority values run first in kernel plugin loops (predictable pluginAdvisory order).
 */

import type { PolicyPlugin, PluginRegistry, WorkflowSpec } from './contracts';

export class DefaultPluginRegistry implements PluginRegistry {
  private readonly plugins: PolicyPlugin[] = [];

  register(plugin: PolicyPlugin): void {
    const name = plugin.name?.trim();
    if (!name) {
      throw new Error('PluginRegistry.register: plugin.name must be non-empty');
    }
    if (this.plugins.some((p) => p.name === name)) {
      throw new Error(`PluginRegistry.register: duplicate plugin name "${name}"`);
    }
    this.plugins.push(plugin);
  }

  getForSpec(spec: WorkflowSpec): PolicyPlugin[] {
    return this.plugins
      .filter((p) => p.appliesTo(spec))
      .slice()
      .sort((a, b) => a.priority - b.priority);
  }

  validate(): void {
    const seen = new Set<string>();
    for (const p of this.plugins) {
      const name = p.name?.trim();
      if (!name) {
        throw new Error('PluginRegistry.validate: empty plugin name');
      }
      if (seen.has(name)) {
        throw new Error(`PluginRegistry.validate: duplicate plugin name "${name}"`);
      }
      seen.add(name);
    }
  }
}
