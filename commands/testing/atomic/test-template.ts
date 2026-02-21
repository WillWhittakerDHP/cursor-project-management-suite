/**
 * Atomic Command: /test-template [type] [file-path] [component-name]
 * Generate a test file from a template
 * 
 * Types: unit, integration, component
 * 
 * This command generates a test file based on the selected template,
 * following best practices and including immutability markers.
 */

import { readFile, writeFile, access } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';

export type TestTemplateType = 'unit' | 'integration' | 'component';

export interface TemplateGenerationResult {
  success: boolean;
  filePath: string;
  message: string;
}

/**
 * Generate test file from template
 */
export async function testTemplate(
  type: TestTemplateType,
  filePath: string,
  componentName?: string
): Promise<TemplateGenerationResult> {
  try {
    // Determine template file
    const templateFile = join(
      PROJECT_ROOT,
      '.cursor/commands/testing/templates',
      `${type}-test-template.md`
    );
    
    // Check if template exists
    try {
      await access(templateFile);
    } catch (err) {
      console.warn('Test template: template file not found', templateFile, err);
      return {
        success: false,
        filePath: '',
        message: `Template not found: ${templateFile}`,
      };
    }
    
    // Read template
    const templateContent = await readFile(templateFile, 'utf-8');
    
    // Extract code block from template (between ```typescript and ```)
    const codeBlockMatch = templateContent.match(/```typescript\n([\s\S]*?)\n```/);
    if (!codeBlockMatch) {
      return {
        success: false,
        filePath: '',
        message: 'Template does not contain a TypeScript code block',
      };
    }
    
    let testCode = codeBlockMatch[1];
    
    // Determine component name from file path if not provided
    if (!componentName) {
      const fileName = basename(filePath, extname(filePath));
      // Remove .test or .spec suffix if present
      componentName = fileName.replace(/\.(test|spec)$/, '');
      // Convert kebab-case or snake_case to PascalCase
      componentName = componentName
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
    }
    
    // Replace placeholders in template
    testCode = testCode
      .replace(/\[DESCRIPTIVE TEST SUITE NAME\]/g, `${componentName} Tests`)
      .replace(/\[component\/function\/module name\]/g, componentName)
      .replace(/\[Component\/Function Name\]/g, componentName)
      .replace(/\[Component Name\]/g, componentName)
      .replace(/\[Feature\/Workflow Name\]/g, componentName)
      .replace(/\[feature\/workflow name\]/g, componentName.toLowerCase())
      .replace(/\[relative path to source\]/g, '../[source-file]'); // User should update this
    
    // Determine output file path
    const fullPath = join(PROJECT_ROOT, filePath);
    const outputDir = dirname(fullPath);
    
    // Ensure directory exists (simplified - in production, use mkdir -p)
    try {
      await access(outputDir);
    } catch (err) {
      console.warn('Test template: output directory does not exist', outputDir, err);
      return {
        success: false,
        filePath: '',
        message: `Output directory does not exist: ${outputDir}. Please create it first.`,
      };
    }
    
    // Check if file already exists
    try {
      await access(fullPath);
      return {
        success: false,
        filePath: fullPath,
        message: `Test file already exists: ${filePath}. Use a different path or delete the existing file.`,
      };
    } catch (err) {
      console.warn('Test template: test file path check failed (proceeding to write)', fullPath, err);
    }
    
    // Write test file
    await writeFile(fullPath, testCode, 'utf-8');
    
    return {
      success: true,
      filePath: fullPath,
      message: `Test file generated successfully at ${filePath}. Remember to update the import path.`,
    };
  } catch (_error) {
    return {
      success: false,
      filePath: '',
      message: `Error generating test file: ${_error instanceof Error ? _error.message : String(_error)}`,
    };
  }
}

