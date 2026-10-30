# Architecture

- **Language**: TypeScript (strict), pure library, no runtime dependencies besides a seedable RNG.
- **Tests**: Vitest. One test per Gherkin scenario, named after the scenario and tagged with its rule IDs.
- **Layout** (implemented in `engine/`; `legal.ts` and `view.ts` hold legal-action and view logic, `engine.ts` the state machine):

```
engine/
  src/
    config.ts      GameConfig and defaults
    cards.ts       land types, deck builders
    rng.ts         seeded shuffle
    state.ts       Game and PlayerView types
    rules/         one module per rule area (turn, counter, effects, win)
    index.ts       public API
  test/
    scenarios/     tests mirroring specs/features/*.feature
    helpers.ts     builder for setting up exact states (hands, lands, graveyards, library order)
specs/
```

- **Test setup**: a state builder lets scenarios set exact hands, battlefields, graveyards, and library order, so rules are tested without relying on shuffles.
- **Workflow**: the engine is built outside-in, one feature file at a time: red test, minimal implementation, refactor.
- The web app later depends on the engine package. It does not change engine rules.
