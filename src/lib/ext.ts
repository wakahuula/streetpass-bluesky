// Firefox's native API is `browser`. Chrome only has `chrome`, which returns
// promises too in Manifest V3.
export const ext: typeof chrome =
  (globalThis as { browser?: typeof chrome }).browser ?? chrome;
