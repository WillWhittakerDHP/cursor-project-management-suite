/**
 * Type definitions for README management commands
 */

export type ReadmeType = 'module' | 'guide' | 'quick-reference' | 'temporary';

export interface ReadmeMetadata {
  /** Whether this README is temporary */
  isTemporary: boolean;
  /** Reason for temporary status */
  temporaryReason?: string;
  /** Expiry date (optional) */
  expiryDate?: string;
  /** Target file for consolidation (optional) */
  consolidateInto?: string;
}

export interface ReadmeAuditResult {
  /** File path */
  filePath: string;
  /** Line count */
  lineCount: number;
  /** Whether file exceeds 300 lines */
  isBloated: boolean;
  /** Whether file is temporary */
  isTemporary: boolean;
  /** Temporary metadata if applicable */
  temporaryMetadata?: ReadmeMetadata;
  /** Structure validation issues */
  structureIssues: string[];
  /** Missing sections */
  missingSections: string[];
  /** Duplicate content detected */
  duplicates: string[];
}

export interface ReadmeCreateParams {
  /** File path for README */
  filePath: string;
  /** Type of README */
  type: ReadmeType;
  /** Title */
  title: string;
  /** Purpose (one sentence) */
  purpose: string;
  /** Overview (2-3 sentences) */
  overview?: string;
  /** For temporary type: reason, expiry, consolidate target */
  temporaryOptions?: {
    reason: string;
    expiryDate?: string;
    consolidateInto?: string;
  };
}

export interface ReadmeConsolidateParams {
  /** Source files to consolidate */
  sources: string[];
  /** Target file */
  target: string;
  /** Whether to remove sources after consolidation */
  removeSources?: boolean;
}

export interface ReadmeSplitParams {
  /** File to split */
  filePath: string;
  /** Sections to extract to GUIDE.md */
  sections: string[];
  /** Whether to keep sections in original README as links */
  keepLinks?: boolean;
}

export interface TemporaryReadmeInfo {
  /** File path */
  filePath: string;
  /** Detection reason */
  reason: string;
  /** Metadata */
  metadata: ReadmeMetadata;
}

