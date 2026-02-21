declare module 'glob' {
  interface GlobOptions {
    cwd?: string;
    ignore?: string[];
    [key: string]: unknown;
  }
  function glob(pattern: string, options?: GlobOptions): Promise<string[]>;
  export { glob };
}
