/**
 * File Cache Manager
 * 
 * Caches file reads to reduce I/O operations.
 * Implements TTL-based expiration and pattern-based invalidation.
 * 
 * LEARNING: Caching reduces redundant file system operations
 * WHY: Reading the same files multiple times is expensive and unnecessary
 * PATTERN: Cache-aside pattern with TTL expiration for freshness
 */

/**
 * Cache entry structure
 */
interface CacheEntry {
  content: string;
  timestamp: number;
}

/**
 * FileCache class
 * 
 * Provides file caching with TTL-based expiration.
 * Supports pattern-based invalidation for related files.
 */
export class FileCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly ttl: number; // Time to live in milliseconds

  /**
   * Create a new file cache
   * @param ttl Time to live in milliseconds (default: 5 minutes)
   */
  constructor(ttl: number = 5 * 60 * 1000) {
    this.ttl = ttl;
  }

  /**
   * Get file content from cache or read from disk
   * @param path File path (relative to project root)
   * @param forceRefresh If true, bypass cache and read from disk
   * @param readFn Function to read file if not in cache
   * @returns File content
   */
  async get(
    path: string,
    forceRefresh: boolean = false,
    readFn: (path: string) => Promise<string>
  ): Promise<string> {
    const now = Date.now();
    const entry = this.cache.get(path);

    // Check if cache entry exists and is still valid
    if (!forceRefresh && entry && (now - entry.timestamp) < this.ttl) {
      return entry.content;
    }

    // Read from disk
    const content = await readFn(path);
    
    // Update cache
    this.cache.set(path, {
      content,
      timestamp: now
    });

    return content;
  }

  /**
   * Set cache entry manually
   * @param path File path
   * @param content File content
   */
  set(path: string, content: string): void {
    this.cache.set(path, {
      content,
      timestamp: Date.now()
    });
  }

  /**
   * Invalidate cache entry for specific path
   * @param path File path to invalidate
   */
  invalidate(path: string): void {
    this.cache.delete(path);
  }

  /**
   * Invalidate cache entries matching pattern
   * 
   * Pattern examples:
   * - "*.log.md" - all log files
   * - "session-*" - all session files
   * - "*guide.md" - all guide files
   * 
   * @param pattern Glob-like pattern (supports * wildcard)
   */
  invalidatePattern(pattern: string): void {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.') // Escape dots
      .replace(/\*/g, '.*'); // Convert * to .*
    
    const regex = new RegExp(`^${regexPattern}$`);

    // Remove matching entries
    for (const path of this.cache.keys()) {
      if (regex.test(path)) {
        this.cache.delete(path);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns Object with cache size and hit/miss counts (if tracked)
   */
  getStats(): { size: number } {
    return {
      size: this.cache.size
    };
  }

  /**
   * Clean expired entries
   * Removes entries that have exceeded TTL
   */
  cleanExpired(): void {
    const now = Date.now();
    for (const [path, entry] of this.cache.entries()) {
      if ((now - entry.timestamp) >= this.ttl) {
        this.cache.delete(path);
      }
    }
  }
}

