// The real `server-only` package throws when it is loaded outside a React
// Server Component, which is exactly what a Node test run looks like. The
// guard is worth keeping in src/, so the test runner aliases it to this.
export {};
