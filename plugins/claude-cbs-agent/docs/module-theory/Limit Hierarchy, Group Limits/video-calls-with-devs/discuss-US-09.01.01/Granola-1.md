# Lit Company Flag and Group Credit Limit Setup

- Group Credit Limit flag applies only to Lit Companies (where Record ID = Lit Company ID)
  - Non-Lit companies cannot change settings (Adem Extension Day, Net Outstanding, Group Credit Limit)
  - Attempting to change these on a non-Lit company returns an error
  - Plugin to enforce this coming in the next few days; task to be created
- Default value for Group Credit Limit is False if not specified on company creation
- Net Outstanding must be set to True when Single Limit is True with netting enabled

# Product Tree and Limit Reference Hierarchy

- Three core tables: Limit Reference (template), Limit (core), Limit Sharing Group
- Limit Reference defines the hierarchy template; core Limit records must match that hierarchy
  - Cannot create a single limit in isolation: parent chain must match the Limit Reference structure
  - Auto-creation: when a subproduct limit is created, the system auto-creates missing parent limits and links the chain
- Reducing Limit field logic:
  - Reducing Limit = True: non-revolving (e.g. mortgage); child limits cannot be revolving (Reducing Limit = False)
  - Reducing Limit = False: revolving (e.g. overdraft card); reverse is allowed
  - Task to be created for this constraint

# Group Limit and Customer Binding Flow

- Correct order for creating a group with limits:
  1. Create Limit Sharing Group record (Loud Customer field empty)
  2. Create limit for the group (with Group ID set)
  3. Create individual limits for each customer (Customer ID set, same Limit Reference ID as group)
  4. Add customers to the group
- Customers without a matching Limit Reference ID will be rejected on binding
- Group ID is populated on the group limit; Customer ID is empty until step 4
- Intermediate limit ID format: Customer ID + separator + Limit Reference ID

# Test Case Decisions and Scope

- Case 16 (Kafka check) deleted: Kafka only relevant in Spec 3; result verifiable via Limit table directly
- Case 15 (line created in suspended state) deleted: duplicate of suspension case; valid to create with Available Marker = False
- Available Limit field (for revolving): to be added in Spec 2, not Spec 1
- Advised Amount is a mandatory field; case testing it as optional removed
- Negative test cases: source from Artur’s original task descriptions, which listed invalid scenarios
- Preconditions need setup: currencies, exchange rates, and customers must all exist before test execution
  - Bruno seeding folder has many existing E2E tests and precondition examples to reference (Ryhor)
- Feature currently deployed to Dev only; UAT deployment pending full test case collection

# Next Steps

- **Investigate menu pruning bug on UAT 1** (Ryhor)
- **Create task for Lit Company plugin enforcement** (Artur)
- **Create task for Reducing Limit parent/child constraint** (Artur)
- **Continue test case review session (Viktoryia, Artur)**
- **Notify when first test cases are ready to deploy to UAT** (Artur)