/**
 * Composite Command: /readme-workflow-cleanup [tier] [identifier]
 * 
 * Tier: Cross-tier utility
 * Operates on: README files
 * 
 * Description: Workflow-integrated cleanup that runs at end of feature/phase/session
 */

import { cleanupTemporaryReadmes } from './readme-cleanup-temporary';
import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';

export type WorkflowTier = 'feature' | 'phase' | 'session';

export interface WorkflowCleanupParams {
  /** Tier level */
  tier: WorkflowTier;
  /** Identifier (feature name, phase number, or session ID) */
  identifier: string;
  /** Feature name (defaults to identifier for feature tier) */
  featureName?: string;
}

/**
 * Workflow-integrated cleanup
 * 
 * @param params Workflow cleanup parameters
 * @returns Cleanup report
 */
export async function workflowCleanupReadmes(params: WorkflowCleanupParams): Promise<string> {
  try {
    const featureName = params.featureName ||
                       (params.tier === 'feature' ? params.identifier : await resolveFeatureName());
    const context = new WorkflowCommandContext(featureName);
    
    // Determine directory scope based on tier
    let directory: string;
    
    switch (params.tier) {
      case 'feature':
        directory = context.paths.getBasePath();
        break;
      case 'phase':
        directory = `${context.paths.getBasePath()}/phases`;
        break;
      case 'session':
        directory = `${context.paths.getBasePath()}/sessions`;
        break;
    }
    
    // Run cleanup with auto-consolidation
    const result = await cleanupTemporaryReadmes(directory, {
      autoConsolidate: true,
      dryRun: false,
    });
    
    return `# Workflow Cleanup: ${params.tier} ${params.identifier}\n\n${result}`;
  } catch (_error) {
    throw new Error(
      `Failed to cleanup READMEs for workflow: ${_error instanceof Error ? _error.message : String(_error)}`
    );
  }
}

