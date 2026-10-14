Ticket: TB-1867
Source: Allure TestOps (`TB CBS` project, Feature `Product Factory Core` > Component `Negotiation Rules and Tracking Engine`)
Fetched: 2026-07-21 via `allure-list-test-cases` (read-only)

# Existing Allure TestOps Test Cases — Negotiation Rules and Tracking Engine

This is a **read-only snapshot** of test cases that already exist in Allure TestOps for this 
feature block, fetched per `/execution:allure-commands:allure-list-test-cases`. It answers the 
open question raised in `analysis.md` (`"Link to TC: in Allure TestOps ?"`) — **yes, this block 
already has 44 Allure-native test cases**, organized under the same three Stories as `analysis.md`. 
This file does not replace or reconcile with the local `TB-1867-test-cases-v1.xlsx`/`.csv` suite — 
see the Changelog note in `analysis.md` about the overlap this creates.

**Total: 44 cases** (16 + 22 + 6, matching Allure's own group counts exactly).

## US-04.02.01 | Comparison Rules Configuration (16 cases)

### [553] [Comparison Rule][DataType] Creating comparison rule with missing Valid Data Type

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields: - ID - Comparison Handler = MAXIMUM - Valid Data Types is empty
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Valid Data Type is required."
2) Check database - pf_comparison_type
   - **Expected:** Comparison Rule is not saved to db

---

### [555] [Comparison Rule][DIFFERENCE] Creating rule with DIFFERENCE handler + DATE Data Type

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields: - ID - Comparison Handler = DIFFERENCE - Valid Data Types = NUMERIC, DATE
   - **Expected:** 400? status code is returned; ACTION_ERRORS: "Invalid Data Type for DIFFERENCE handler. Value cannot contain temporal values."
2) Check database - pf_comparison_type
   - **Expected:** Comparison Rule is not saved to db

---

### [615] [Comparison Rule][DIFFERENCE] Creating rule with DIFFERENCE handler + DATE_TIME Data Type

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields:  - ID  - Comparison Handler = DIFFERENCE  - Valid Data Types = AMOUNT, RATE, DATE_TIME
   - **Expected:** 400? status code is returned; ACTION_ERRORS: "Invalid Data Type for DIFFERENCE handler. Value cannot contain temporal values."
2) Check database - pf_comparison_type
   - **Expected:** Comparison Rule is not saved to db

---

### [550] [Comparison Rule][DIFFERENCE] Creating rule with DIFFERENCE handler + full allowed Data Type set

- **Status:** Active  
- **Tags:** API, Positive, Smoke  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields: - ID - Comparison Handler = DIFFERENCE - Valid Data Types = NUMERIC, AMOUNT, RATE, PERIOD
   - **Expected:** API returns 201 Created success status code; Response with created Comparison Rule with all 4 selected Data Types is returned
2) Check database - pf_comparison_type
   - **Expected:** New Comparison Rule with all selected Data Types is successfully saved in the database

---

### [616] [Comparison Rule][DIFFERENCE] Creating rule with DIFFERENCE handler + TIME Data Type

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields:  - ID  - Comparison Handler = DIFFERENCE  - Valid Data Types = PERIOD, TIME
   - **Expected:** 400? status code is returned; ACTION_ERRORS: "Invalid Data Type for DIFFERENCE handler. Value cannot contain temporal values."
2) Check database - pf_comparison_type
   - **Expected:** Comparison Rule is not saved to db

---

### [554] [Comparison Rule][Handler] Creating comparison rule with missing Comparison Handler

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields: - ID - Comparison Handler is empty - Valid Data Types = NUMERIC
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Comparison Handler is required."
2) Check database - pf_comparison_type
   - **Expected:** Comparison Rule is not saved to db

---

### [552] [Comparison Rule][ID] Creating comparison rule with missing ID

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields: - ID is empty - Comparison Handler = MINIMUM - Valid Data Types = NUMERIC
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "ID is required."
2) Check database - pf_comparison_type
   - **Expected:** Comparison Rule is not saved to db

---

### [620] [Comparison Rule][MAXIMUM] Creating rule with MAXIMUM handler and full set of valid Data Types

- **Status:** Active  
- **Tags:** API, Positive, Smoke  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields:  - ID  - Comparison Handler = MAXIMUM - Valid Data Types = NUMERIC, AMOUNT, RATE, DATE, TIME, DATE_TIME, PERIOD
   - **Expected:** API returns 201 Created success status code; Response with created Comparison Rule with all 7 selected Data Types is returned
2) Check database - pf_comparison_type
   - **Expected:** New Comparison Rule with all selected Data Types is successfully saved in the database

---

### [549] [Comparison Rule][MINIMUM] Creating rule with MINIMUM handler and full set of valid Data Types

- **Status:** Active  
- **Tags:** API, Positive, Smoke  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields: - ID - Comparison Handler = MINIMUM - Valid Data Types = NUMERIC, AMOUNT, RATE, DATE, TIME, DATE_TIME, PERIOD
   - **Expected:** API returns 201 Created success status code; Response with created Comparison Rule with all 7 selected Data Types is returned
2) Check database - pf_comparison_type
   - **Expected:** New Comparison Rule with all selected Data Types is successfully saved in the database

---

### [621] [Comparison Rule] SEE comparison rule after creation

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with SEE access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.
3. PF.COMPARISON.TYPE contains created Comparison Rule record ex. "CMP-MIN-001" with Comparison Handler = MINIMUM and Valid Data Types = NUMERIC, DATE.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = SEE

**Steps & Expected Results:**

1) Send SEE request to see created comparison rule
   - **Expected:** 200 OK response code is returned; Rule with all filled fields is displayed

---

### [551] [Comparison Rule][TOLERANCE] Creating rule with TOLERANCE handler and full allowed Data Type set

- **Status:** Active  
- **Tags:** API, Positive, Smoke  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields: - ID - Comparison Handler = TOLERANCE - Valid Data Types = NUMERIC, AMOUNT, RATE
   - **Expected:** API returns 201 Created success status code; Response with created Comparison Rule with all 3 selected Data Types is returned
2) Check database - pf_comparison_type
   - **Expected:** New Comparison Rule with all selected Data Types is successfully saved in the database

---

### [617] [Comparison Rule][TOLERANCE] Creating rule with TOLERANCE handler + DATE Data Type

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields: - ID - Comparison Handler = TOLERANCE  - Valid Data Types = AMOUNT, RATE, DATE
   - **Expected:** 400? status code is returned; ACTION_ERRORS: "Invalid Data Type for TOLERANCE handler. Value cannot contain temporal or period values."
2) Check database - pf_comparison_type
   - **Expected:** Comparison Rule is not saved to db

---

### [618] [Comparison Rule][TOLERANCE] Creating rule with TOLERANCE handler + DATE_TIME Data Type

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields: - ID - Comparison Handler = TOLERANCE  - Valid Data Types = AMOUNT, RATE, DATE_TIME
   - **Expected:** 400? status code is returned; ACTION_ERRORS: "Invalid Data Type for TOLERANCE handler. Value cannot contain temporal or period values."
2) Check database - pf_comparison_type
   - **Expected:** Comparison Rule is not saved to db

---

### [556] [Comparison Rule][TOLERANCE] Creating rule with TOLERANCE handler + PERIOD Data Type

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields: - ID - Comparison Handler = TOLERANCE - Valid Data Types = RATE, PERIOD
   - **Expected:** 400? status code is returned; ACTION_ERRORS: "Invalid Data Type for TOLERANCE handler. Value cannot contain temporal or period values."
2) Check database - pf_comparison_type
   - **Expected:** Comparison Rule is not saved to db

---

### [619] [Comparison Rule][TOLERANCE] Creating rule with TOLERANCE handler + TIME Data Type

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create a Comparison Rule with the following fields: - ID - Comparison Handler = TOLERANCE  - Valid Data Types = NUMERIC, TIME
   - **Expected:** 400? status code is returned; ACTION_ERRORS: "Invalid Data Type for TOLERANCE handler. Value cannot contain temporal or period values."
2) Check database - pf_comparison_type
   - **Expected:** Comparison Rule is not saved to db

---

### [557] [Comparison Rule] Update comparison rule after creation (immutability violation)

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. VALID_DATA_TYPES and COMPARISON_HANDLER_ID static dictionaries are configured in the Field registry.
3. PF.COMPARISON.TYPE contains created Comparison Rule record ex. "CMP-MIN-001" with Comparison Handler = MINIMUM and Valid Data Types = NUMERIC, DATE.

**Test Data:**
**Params Path:**
* **projectionId** = PF.COMPARISON.TYPE
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to update existent Comparison Rule from precondition with the following fields: - Valid Data Types
   - **Expected:** 400? response code is returned; ACTION_ERRORS: "Comparison Rule is immutable after creation"
2) Check database - pf_comparison_type
   - **Expected:** NOT updated Comparison Rule is displayed in the database

---

## US-04.02.02 | Condition-Level Negotiation Governance (22 cases)

### [571] [Condition][Comparison info] Creating condition with Comparison information specified on a non-negotiable field

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation Rules: - Field Name = Account Number Type - Negotiability = FALSE - Mandatory = FALSE - Override = FALSE - Reset Option = FALSE  - Comparison Type = CMP-MIN-001 - Threshold Value = 100.00 - Breach Action = ERROR
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Comparison information cannot be defined for a NON-NEGOTIABLE field."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [563] [Condition][Comparison info] Creating condition with Negotiability flag=true and no comparison information specified

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation rules: - Field Name = Interest Rate - Negotiability = TRUE - Mandatory = TRUE - Override = FALSE - Reset Option = TRUE no Comparison Type, Threshold Value, Breach Action specified
   - **Expected:** API returns 201 Created success status code; Response with created Account Condition with negotiable field and no Comparison information is returned
2) Check database - pf_product_account_condition
   - **Expected:** New Account Condition with negotiation rules is successfully saved in the database

---

### [561] [Condition][Comparison info] Creating condition with non-negotiable field and no comparison information

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = FALSE  - Default Reset Flag = FALSE  Negotiation rules: - Field Name = Account Number Type - Negotiability = FALSE - Mandatory = FALSE - Override = FALSE - Reset Option = FALSE no Comparison Type, Threshold Value, Breach Action specified
   - **Expected:** API returns 201 Created success status code; Response with created Account Condition with non-negotiable field is returned
2) Check database - pf_product_account_condition
   - **Expected:** New Account Condition with negotiation rules is successfully saved in the database

---

### [576] [Condition][Comparison Type] Creating condition with a duplicate Comparison Type configured for the same field

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation rules: - Field Name = Account Number Type - Negotiability = TRUE - Mandatory = FALSE - Override = FALSE - Reset Option = FALSE  - Comparison Type 1 = CMP-MIN-001 - Threshold Value = 100.00 - Breach Action = ERROR  - Comparison Type 2 = CMP-MIN-002 - Threshold Value = 150.00 - Breach Action = OVERRIDE  добавить 2 разных рула на 1 поле одинакового типа - переделать
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "The selected Comparison Type has already been configured for this field."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [572] [Condition][Comparison Type] Creating condition with Comparison Type incompatible with the field's Data Type

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation rules: - Field Name = Account Number Type - Negotiability = TRUE - Mandatory = FALSE - Override = FALSE - Reset Option = FALSE  - Comparison Type = CMP-MIN-001 - Threshold Value = 100.00 - Breach Action = ERROR   Field is not a NUMERIC or DATE type field, while CMP-MIN-001 Valid Data Types = NUMERIC, DATE
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "The data type of the specified field is incompatible with the selected Comparison Type."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [573] [Condition][Comparison Type] Creating condition with Comparison Type specified but missing Threshold Value / Breach Action

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation Rules: - Field Name = Interest Rate - Negotiability = TRUE - Mandatory = FALSE - Override = FALSE - Reset Option = FALSE  - Comparison Type = CMP-MIN-001   Threshold Value and Breach Action are not specified
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Both Threshold Value and Breach Action must be specified alongside a Comparison Type."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [562] [Condition][Comparison Type] Creating condition with multiple Comparison Types configured for a single field

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).
4. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MAX-001" (Comparison Handler = MAXIMUM, Valid Data Types = NUMERIC, AMOUNT).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation rules:  - Field Name = Interest Rate - Negotiability = TRUE - Mandatory = FALSE - Override = FALSE - Reset Option = TRUE  - Comparison Type 1 = CMP-MIN-001 - Threshold Value = 100.00 - Breach Action = ERROR  - Comparison Type 2 = CMP-MAX-001 - Threshold Value = 500.00 - Breach Action = OVERRIDE
   - **Expected:** API returns 201 Created success status code; Response with created Account Condition with both configured Comparison Types on the same field is returned
2) Check database - pf_product_account_condition
   - **Expected:** New Account Condition with negotiation rules is successfully saved in the database

---

### [574] [Condition][Comparison Type] Creating condition with Threshold Value and Breach Action specified but missing Comparison Type

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation Rules: - Field Name = Interest Rate - Negotiability = TRUE - Mandatory = FALSE - Override = FALSE - Reset Option = FALSE  - Threshold Value = 100.00 - Breach Action = ERROR   Comparison Type is not specified
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Comparison Type must be defined when a Threshold Value or Breach Action is present."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [559] [Condition] Creating condition with Default Negotiable/Reset flags only (no field-level negotiation)

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields: - Default Negotiable Flag = TRUE - Default Reset Flag = TRUE  no negotiation rules are specified
   - **Expected:** API returns 201 Created success status code; Response with created Account Condition and Default negotiation flags is returned
2) Check database - pf_product_account_condition
   - **Expected:** New Account Condition with negotiation rules is successfully saved in the database

---

### [564] [Condition] Creating condition with field-level negotiation rules for two different business fields

- **Status:** Active  
- **Tags:** API, Positive, Smoke  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields: - Default Negotiable Flag = TRUE - Default Reset Flag = TRUE Negotiation rules:  - Field Name = Base Date Type - Negotiability = TRUE - Mandatory = TRUE - Override = TRUE - Reset Option = TRUE - Comparison Type = CMP-MIN-001 - Threshold Value = 100.00 - Breach Action = ERROR   - Field Name = Account Number Type - Negotiability = FALSE - Mandatory = FALSE - Override = FALSE - Reset Option = FALSE
   - **Expected:** API returns 201 Created success status code; Response with created Account Condition with both field-level negotiation rules is returned
2) Check database - pf_product_account_condition
   - **Expected:** New Account Condition with negotiation rules is successfully saved in the database

---

### [560] [Condition] Creating condition with full field-level negotiation rule

- **Status:** Active  
- **Tags:** API, Positive, Smoke  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation Rules: - Field Name = Account Number Type - Negotiability = TRUE - Mandatory = TRUE - Override = TRUE - Reset Option = TRUE - Comparison Type = CMP-MIN-001 - Threshold Value = 100.00 - Breach Action = ERROR
   - **Expected:** API returns 201 Created success status code; Response with created Account Condition with full field-level negotiation rule is returned
2) Check database - pf_product_account_condition
   - **Expected:** New Account Condition with negotiation rules is successfully saved in the database

---

### [565] [Condition][Default Negotiable flag] Creating condition with missing Default Negotiable flag

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag is empty  - Default Reset Flag is set
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Default flag is required."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [622] [Condition][Default Reset flag] Creating condition with missing Default Reset flag

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag is set - Default Reset Flag is empty
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Default flag is required."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [567] [Condition][FieldName] Creating condition with Field Name referring to a negotiation field instead of a business field

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation Rules: - Field Name = Default Negotiable Flag - Negotiability = TRUE - Mandatory = FALSE - Override = TRUE - Reset Option = TRUE
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Field-level negotiation rules can only be applied to condition business fields."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [624] [Condition][FieldName] Creating condition with Field Name specified but missing Mandatory flag

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation Rules: - Field Name = Account Number Type - Negotiability = TRUE - Override = TRUE - Reset Option = TRUE Mandatory flag is not specified
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Specifying a Field Name requires explicit definitions for its Negotiability, Mandatory, Override, and Reset Option flags."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [625] [Condition][FieldName] Creating condition with Field Name specified but missing Negotiability flag

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation Rules: - Field Name = Account Number Type - Mandatory = TRUE - Reset Option = TRUE - Override = TRUE Negotiability is not specified
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Specifying a Field Name requires explicit definitions for its Negotiability, Mandatory, Override, and Reset Option flags."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [568] [Condition][FieldName] Creating condition with Field Name specified but missing Override flag

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation Rules: - Field Name = Account Number Type - Negotiability = TRUE - Mandatory = TRUE - Reset Option = TRUE Override flag is not specified
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Specifying a Field Name requires explicit definitions for its Negotiability, Mandatory, Override, and Reset Option flags."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [623] [Condition][FieldName] Creating condition with Field Name specified but missing Reset Option flag

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation Rules: - Field Name = Account Number Type - Negotiability = TRUE - Mandatory = TRUE - Override = TRUE Reset Option flag is not specified
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Specifying a Field Name requires explicit definitions for its Negotiability, Mandatory, Override, and Reset Option flags."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [566] [Condition][FieldName] Creating condition with Field Name that does not exist in the target Condition

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation Rules: - Field Name = Non-existent Field - Negotiability = TRUE - Mandatory = FALSE - Override = FALSE  - Reset Option = TRUE
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Specified field does not exist in the target Condition."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [569] [Condition][MANDATORY] Creating condition with non-negotiable field configured as Mandatory

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation Rules: - Field Name = Account Number Type - Negotiability = FALSE  - Mandatory = TRUE - Override = FALSE - Reset Option = FALSE
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Mutually exclusive negotiation options: MANDATORY value is not permitted on a NON_NEGOTIABLE field."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [570] [Condition][OVERRIDE] Creating condition with non-negotiable field configured as Override

- **Status:** Active  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation Rules: - Field Name = Account Number Type - Negotiability = FALSE  - Mandatory = FALSE - Override = TRUE - Reset Option = FALSE
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Mutually exclusive negotiation options: OVERRIDE value is not permitted on a NON_NEGOTIABLE field."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

### [575] ??? [Condition][Threshold Value] Creating condition with Threshold Value format not matching the target field's type

- **Status:** Active  
- **Tags:** API, Negative  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access.
2. In PF.ATTRIBUTE.CLASS a class with types DATED, NON.TRACKING, OPT.CCY is created.
3. PF.COMPARISON.TYPE contains an active Comparison Rule "CMP-MIN-001" (Comparison Handler = MINIMUM, Valid Data Types = NUMERIC, DATE).

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to create an Account Condition with the following fields:  - Default Negotiable Flag = TRUE  - Default Reset Flag = TRUE  Negotiation Rules: - Field Name = Account Number Type - Negotiability = TRUE - Mandatory = FALSE - Override = FALSE - Reset Option = FALSE  - Comparison Type = CMP-MIN-001 - Threshold Value = 2026-01-01 - Breach Action = ERROR   Account Number Type is a NUMERIC-type field, Threshold Value is provided in date format
   - **Expected:** 400? error code is returned; ACTION_ERRORS: "Data type mismatch: Threshold Value format does not correspond to the target field type."
2) Check database - pf_product_account_condition
   - **Expected:** Account Condition is not saved to db

---

## US-04.02.03 | Contract-Product Linking and Mass Maintenance (6 cases)

### [851] [Product] 2 new conditions are added to the new product

- **Status:** Review  
- **Tags:** API, Positive, Smoke  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access to PF.BUILDER, PF.MANAGER, PF.CATALOG.
2. CONTRACT_LINK_TYPE field is configured in the Field registry with values TRACKING, NON.TRACKING, CUSTOM.TRACKING.
3. PF.PRODUCT.ACCOUNT.CONDITION table exists with
*  1st condition (ex. ACC-USD-20260621) - _create condition with effective date like current date minus 1 month_
* 2nd condition (ex. ACC-USD-20260721) - _create condition with effective date like current date plus 1 month_

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Params Path:**
* **projectionId** = PF.BUILDER
* **operation** = INPUT

**Params Path:**
* **projectionId** = PF.MANAGER
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to PF.BUILDER table to create new Product and add id of Condition  - ex. ACC
   - **Expected:** API returns 200 OK; Product is created and ACC condition is added
2) Send POST request to PF.MANAGER to Validate tested product with added condition
   - **Expected:** API returns 200 OK; PRODUCT_STATUS is validated; RESOLVED_CONDITIONS contain BOTH linked conditions - ACC condition with effective date in the past and in the future
3) Send POST request to PF.MANAGER to Catalog tested product with modified condition
   - **Expected:** API returns 200 OK; PRODUCT_STATUS is validated; PRODUCT_VERSION: 1; RESOLVED_CONDITION: contains BOTH linked conditions - ACC condition with effective date in the past and in the future

---

### [752] [Product] CONTRACT_LINK_TYPE can't be updated in created product

- **Status:** Review  
- **Tags:** API, Positive, Smoke  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access to PF.BUILDER, PF.MANAGER, PF.CATALOG.
2. CONTRACT_LINK_TYPE field is configured in the Field registry with values TRACKING, NON.TRACKING, CUSTOM.TRACKING.
3. PF.PRODUCT.ACCOUNT.CONDITION table exists with created condition (ex. ACC-USD-20270101)
4. Some Product already exists in PF.CATALOG with 
* link to created Account Condition (made while product creation in PF.BUILDER)
* specified CONTRACT_LINK_TYPE = TRACKING value (made while product creation in PF.BUILDER)

**Params Path:**
* **projectionId** = PF.BUILDER
* **operation** = INPUT

**Params Path:**
* **projectionId** = PF.MANAGER
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to PF.BUILDER for tested product to update CONTRACT_LINK_TYPE value
   - **Expected:** API returns  400, CONTRACT_LINK_TYPE value can't be updated
2) should we add case with adding new separate condition? was added ACC and we add ACC1?

---

### [631] [Product] Linking new condition does not auto-update cataloged product

- **Status:** Review  
- **Tags:** API, Positive, Smoke  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access to PF.BUILDER, PF.MANAGER, PF.CATALOG.
2. CONTRACT_LINK_TYPE field is configured in the Field registry with values TRACKING, NON.TRACKING, CUSTOM.TRACKING.
3. PF.PRODUCT.ACCOUNT.CONDITION table exists with 1st condition (ex. ACC-USD-20230101) - _create condition with effective date like current date minus 1 month_
4. Some Product already exists in PF.CATALOG with 
* link to created Account Condition with id ACC (made while product creation in PF.BUILDER)
* specified CONTRACT_LINK_TYPE = NON_TRACKING value (made while product creation in PF.BUILDER)
* PRODUCT_STATUS: "N"

**Test Data:**
**Params Path:**
* **projectionId** = PF.PRODUCT.ACCOUNT.CONDITION
* **operation** = INPUT

**Params Path:**
* **projectionId** = PF.BUILDER
* **operation** = INPUT

**Params Path:**
* **projectionId** = PF.MANAGER
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to PF.PRODUCT.ACCOUNT.CONDITION table to create new Account Condition field with effective date current date plus 1 month and link to tested Product
   - **Expected:** API returns 200 OK, new Condition is saved to pf_product_account_condition and linked to tested product
2) Send POST request to PF.MANAGER to Validate tested product with added condition
   - **Expected:** API returns 200 OK; PRODUCT_STATUS is validated; RESOLVED_CONDITIONS contain BOTH linked conditions - ACC condition with effective date in the past and in the future
3) Check database - pf_catalog - liv space - tested Product with added condition - Resolved Conditions field
   - **Expected:** Product's Resolved Condition in pf_catalog is NOT automatically updated; only 1 first condition is added for product; product requires an explicit Validate and Catalog action in PF.MANAGER to adopt the change; PRODUCT_STATUS: "N"
4) Send POST request to PF.MANAGER to Catalog tested product with modified condition
   - **Expected:** API returns 200 OK; PRODUCT_STATUS is validated; PRODUCT_VERSION: incremented to N+1; RESOLVED_CONDITION: contains BOTH linked conditions - ACC condition with effective date in the past and in the future

---

### [677] [Product][Tracker] Modifying a CUSTOM.TRACKING condition on an already cataloged product

- **Status:** Review  
- **Tags:** API, Positive, Regression  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access to PF.BUILDER, PF.MANAGER, PF.CATALOG.
2. CONTRACT_LINK_TYPE field is configured in the Field registry with values TRACKING, NON.TRACKING, CUSTOM.TRACKING.
3. PF.PRODUCT.ACCOUNT.CONDITION table exists and have some created condition (ex. Account condition with ACC-USD-20270101 id)
4. Some Product already exists in PF.BUILDER, PF.PRODUCT, PF.MANAGER and PF.CATALOG with:
* link to created Account Condition ex. ACC-USD-20270101 id (made while product creation in PF.BUILDER)
* specified CONTRACT_LINK_TYPE = CUSTOM.TRACKING value (made while product creation in PF.BUILDER)

**Test Data:**
**Params Path:**
* **projectionId** = PF.BUILDER
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to PF.PRODUCT.ACCOUNT.CONDITION table to update the Account Condition field value linked to tested Product
   - **Expected:** API returns 200 OK, updated Condition is saved to pf_product_account_condition
2) Check database - pf_product_tracker - liv space
   - **Expected:** A new tracking record for tested product is NOT created
3) Send POST request to PF.MANAGER to Validate the product
   - **Expected:** API returns 200 OK, product status updated to "Validated"
4) Check database - pf_product_tracker - liv space
   - **Expected:** A new tracking record for tested product is NOT created
5) Send POST request to PF.CATALOG to Catalog the product
   - **Expected:** API returns 200 OK, product status updated to "Cataloged"
6) Check database - pf_product_tracker - liv space
   - **Expected:** A new tracking record is created with PRODUCT_ID, STATUS = PENDING, and UPDATED_ATTRIBUTES containing changed field and it's value

---

### [628] [Product][Tracker] Modifying a NON.TRACKING condition on an already cataloged product

- **Status:** Review  
- **Tags:** API, Positive, Smoke  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access to PF.BUILDER, PF.MANAGER, PF.CATALOG.
2. CONTRACT_LINK_TYPE field is configured in the Field registry with values TRACKING, NON.TRACKING, CUSTOM.TRACKING.
3. PF.PRODUCT.ACCOUNT.CONDITION table exists and have some created condition (ex. Account condition with ACC-USD-20270101 id)
4. Some Product already exists in PF.BUILDER, PF.PRODUCT, PF.MANAGER and PF.CATALOG with: 
* link to created Account Condition ex. ACC-USD-20270101 id (made while product creation in PF.BUILDER)
* specified CONTRACT_LINK_TYPE = NON.TRACKING value (made while product creation in PF.BUILDER)

**Test Data:**
**Params Path:**
* **projectionId** = PF.BUILDER
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to PF.PRODUCT.ACCOUNT.CONDITION table to update the Account Condition field value linked to tested Product
   - **Expected:** API returns 200 OK, updated Condition is saved to pf_product_account_condition
2) Check database - pf_product_tracker
   - **Expected:** No tracking record is created for tested product in pf_product_tracker
3) Send POST request to PF.MANAGER to Validate the product
   - **Expected:** API returns 200 OK, product status updated to "Validated"
4) Check database - pf_product_tracker
   - **Expected:** No tracking record is created for tested product in pf_product_tracker
5) Send POST request to PF.CATALOG to Catalog the product tested product
   - **Expected:** API returns 200 OK, product status updated to "Cataloged"
6) Check database - pf_product_tracker
   - **Expected:** No tracking record is created for tested product in pf_product_tracker

---

### [627] [Product][Tracker] Modifying a TRACKING condition on an already cataloged product

- **Status:** Review  
- **Tags:** API, Positive, Smoke  
- **Automated:** False

**Description / Preconditions / Test Data (as stored in Allure's `description` field):**

**Preconditions:**
1. User is logged in and authorized with INPUT access to PF.BUILDER, PF.MANAGER, PF.CATALOG.
2. CONTRACT_LINK_TYPE field is configured in the Field registry with values TRACKING, NON.TRACKING, CUSTOM.TRACKING.
3. PF.PRODUCT.ACCOUNT.CONDITION table exists and have some created condition (ex. Account condition with ACC-USD-20270101 id) with some optional fields specified.
4. Some Product already exists in PF.BUILDER, PF.PRODUCT, PF.MANAGER and PF.CATALOG with:
* link to the 1st Account Condition ex. ACC-USD-20270101 id (made while product creation in PF.BUILDER)
* specified CONTRACT_LINK_TYPE = TRACKING value (made while product creation in PF.BUILDER)

**Test Data:**
**Params Path:**
* **projectionId** = PF.BUILDER
* **operation** = INPUT

**Steps & Expected Results:**

1) Send POST request to PF.PRODUCT.ACCOUNT.CONDITION table to update the Account Condition optional field value linked to tested Product
   - **Expected:** API returns 200 OK, updated Condition is saved to pf_product_account_condition
2) Check database - pf_product_tracker - liv space
   - **Expected:** A new tracking record for tested product is NOT created
3) Send POST request to PF.MANAGER to Validate the product
   - **Expected:** API returns 200 OK, product status updated to "Validated"
4) Check database - pf_product_tracker - liv space
   - **Expected:** A new tracking record for tested product is NOT created
5) Send POST request to PF.MANAGER to Catalog the product
6) API returns 200 OK, product status updated to "Cataloged"
7) Check database - pf_product_tracker - liv space
   - **Expected:** A new tracking record is created with PRODUCT_ID, STATUS = PENDING, and UPDATED_ATTRIBUTES containing changed field and it's value

---
