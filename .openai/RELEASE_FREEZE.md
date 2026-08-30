# Public release freeze

Do not save or deploy a new Sites version for ordinary scene additions, content batches, fixes, or agent handoffs.

A public release is allowed only when one of these conditions is true:

1. The user explicitly requests a one-off public preview in the current conversation.
2. The world contains at least 10,000 globally unique, visibly grounded spatial display terms and is ready for the milestone release.

Before either release, run the matching preflight and then `npm run verify:full` against the same clean commit:

- Milestone: `npm run release:check -- --milestone`
- Explicit preview: `HELLOWORDS_EXPLICIT_PREVIEW_APPROVAL=YES npm run release:check -- --explicit-user-preview`

One authorized batch produces one public version. A failed check, a partial batch, a single-scene completion, or an agent completion must not create a Sites version. Local development and local previews remain allowed.
