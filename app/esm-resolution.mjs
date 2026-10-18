// Node tests use the same ESM entry Vite selects via the package's `module`
// field. Its `main` points to an IIFE and has no named exports under Node.
export function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === '@kabelsalat/web' ? '@kabelsalat/web/dist/index.mjs' : specifier, context);
}
