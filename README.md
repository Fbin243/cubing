# Cubing

An independent 3×3 speedcubing timer and training app. All source, dependencies, tests, and deployment configuration live here; it does not require a parent repository.

Requires Node.js and npm. Run `npm install`, `npm run dev`, `npm test`, and `npm run build`. The production output is `dist/`, suitable for static hosting. All solve data stays in the browser; browser storage may be cleared by the user or browser. Back up data before clearing it.

Fbin Playground can link to the deployed site but does not import this repository. No backend, shared database, or credentials are required.

## Current training limitations

OLL and PLL identifiers are internal pattern keys, not standard case names. Their scrambles use representative states and U adjustments rather than uniform random states; independent comparison with a canonical case catalog is still pending. Single-slot F2L practice is not a named case selector. Easy D cross scrambles have a cross solvable in at most four face turns, but their distribution is not uniform and they may already have a solved cross. These modes should not be assumed equivalent to csTimer's generators.

The app can cache assets for offline use after a successful online visit, but browser storage and service-worker behavior vary. Export a JSON backup before clearing browser data or changing devices.
