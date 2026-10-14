# Test Case Review: Limits and Groups

- Stopped at case 21 previously; resumed from case 28
- Cases reviewed cover Single Limit, group limits, currency, hierarchy, and negative/error scenarios
- Error codes (400, 422) not yet finalized across cases
  - Error codes to be revisited once all cases are complete
  - Nastya replaced Kolya, causing delays; current build ships with random ID messages for now

# Account and Contract Addition Logic

- Second account on a Single Limit must be added via contract creation, not manually
  - Contract must have conditions with a class attribute set to limit
  - Users cannot add accounts directly; only bilateral addition through plugins
- Case needs reworking: current JSON shows account 1 and account 2 incorrectly
  - Must be revised to reflect contract-based addition flow

# Group Limits and Totalos Validation

- Adding a customer to a group requires checking Totalos
  - Each customer’s Totalos contributes to the group’s total
  - Group Totalos must not exceed the group limit amount
  - If adding a new customer would push group Totalos over the limit, operation is rejected
- Group flag (Company Group Credit Limit) set to false blocks all group create, modify, and authorize operations
  - Flag cannot be disabled once groups exist and are in use
  - Related read-via-inquiry case removed as invalid

# Hierarchy and Parent/Child Limit Rules

- Parent limit can only be reduced if it stays above all child limits
  - If any child exceeds the new parent value, the whole operation fails
  - Checks propagate up to root; failure at any level rolls back the entire operation
- Negative cases confirmed:
  - Child limit > parent: 400 error
  - No direct parent, child > nearest ancestor: 400, intermediate nodes not created
  - Draft child fails AUS after parent is reduced below it
  - Node with any existing limits (active or inactive) cannot be moved in the tree
  - Cyclic references (node as its own parent, or root made child of its own product): 400
  - Parent node exists only as unauthorized draft: cannot be referenced, 400
- Physical delete not supported on lif records; delete only works on nau (draft) entries

# Master Projection and Workspace Menu Fix

- Workspace menu was set up as a normal projection; master was intended for internal use only
  - Ryhor added a restriction plugin to master to block user access, but plugin was not loaded
  - Tests have been running through master without hooks or validation
- Decision: switch Workspace menu to a non-system projection; update code and Bruno config
  - Frontend uses navigation projection, which is not changing, so no frontend impact
  - Some existing test cases may break due to records seeded incorrectly in the lif table
- Ryhor to push the restriction plugin to master and update projections within ~1 hour
  - Artur to follow up with Olya on the change

# Next Steps

- **Push restriction plugin to master projection** (Ryhor)
- **Update code and Bruno config to switch Workspace menu to non-system projection**
- **Backfill error codes into all negative test cases**
- **Continue test case review tomorrow** (Artur, Viktoryia)