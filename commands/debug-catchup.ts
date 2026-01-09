/**
 * Debug script for test catch-up workflow
 */

import { WorkflowCommandContext } from './utils/command-context';
import { readProjectFile } from './utils/utils';

async function debugCatchup() {
  try {
    const context = new WorkflowCommandContext('data-flow-alignment');
    
    console.log('=== Feature Detection ===');
    console.log('Feature:', context.feature.name);
    
    console.log('\n=== Reading Feature Guide ===');
    const featureGuide = await context.readFeatureGuide();
    console.log('Feature guide length:', featureGuide.length);
    
    const phaseMatches = Array.from(featureGuide.matchAll(/Phase\s+(\d+)/g));
    console.log('Found phases in guide:', phaseMatches.map(m => m[1]));
    
    console.log('\n=== Checking Each Phase ===');
    for (const match of phaseMatches) {
      const phase = match[1];
      console.log(`\n--- Phase ${phase} ---`);
      
      try {
        const phaseGuide = await context.readPhaseGuide(phase);
        console.log(`Phase guide length: ${phaseGuide.length}`);
        
        // Check status
        const statusMatch = phaseGuide.match(/\*\*Status:\*\*\s*(.+)/i);
        console.log(`Status line: ${statusMatch ? statusMatch[1] : 'NOT FOUND'}`);
        
        const isComplete = /\*\*Status:\*\*\s*Complete/i.test(phaseGuide);
        console.log(`Is complete: ${isComplete}`);
        
        if (isComplete) {
          // Check if tests have run
          const logPath = context.paths.getPhaseLogPath(phase);
          console.log(`Log path: ${logPath}`);
          try {
            const logContent = await readProjectFile(logPath);
            const hasTests = /\*\*Tests Run:\*\*/i.test(logContent);
            console.log(`Has tests run: ${hasTests}`);
          } catch (e) {
            console.log(`Log read error: ${e instanceof Error ? e.message : String(e)}`);
          }
          
          // Check sessions
          const sessionMatches = Array.from(phaseGuide.matchAll(/Session\s+(\d+\.\d+)/g));
          console.log(`Sessions found: ${sessionMatches.map(m => m[1]).join(', ')}`);
          
          for (const sessionMatch of sessionMatches) {
            const sessionId = sessionMatch[1];
            console.log(`  Session ${sessionId}:`);
            try {
              const sessionGuide = await context.readSessionGuide(sessionId);
              const sessionComplete = /- \[x\]/i.test(sessionGuide) || /Session.*complete/i.test(sessionGuide);
              console.log(`    Complete: ${sessionComplete}`);
              
              const logPath = context.paths.getSessionLogPath(sessionId);
              try {
                const logContent = await readProjectFile(logPath);
                const hasTests = /\*\*Tests Run:\*\*/i.test(logContent);
                console.log(`    Has tests run: ${hasTests}`);
              } catch (e) {
                console.log(`    Log read error: ${e instanceof Error ? e.message : String(e)}`);
              }
            } catch (e) {
              console.log(`    Error reading session guide: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
      } catch (e) {
        console.log(`Error reading phase guide: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

debugCatchup();

