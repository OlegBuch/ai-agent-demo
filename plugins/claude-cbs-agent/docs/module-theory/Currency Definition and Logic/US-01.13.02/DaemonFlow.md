# Currency Order Flow

- Currency orders store exchange rate records; only new status records can be modified
  - canceled or processed records are locked: edits should throw an error, not silently pass
- Two ingestion paths:
  - Batch: direct insert to live, no authorization needed
  - Master: record lands in now first, requires manual authorization before moving to live
- Once in live, a schedule task is created with a UTC timestamp (e.g. 09:15)
  - At trigger time, the scheduler fetches all new records matching that timestamp
  - Sends rates to Currency Rate service, then updates each order’s status to processed
- Full flow demoed live on QA: record created via master, authorized, moved to live, schedule task fired, status flipped to processed, USD/EUR rate confirmed in Currency Rate table

# Currency Engine and Transit Logic

- Engine supports direct rate lookup and transit currency conversion
  - Transit currency can be explicit in the request, or resolved automatically via fallback chain:
    1. Company-level transit_currency
    2. Company-level local_currency
    3. System-level default_global_currency
    4. Error if none found
- mandatory_regulation flag on company forces all conversions through a fixed regulation currency
  - If set, specifying a transit currency in the request should throw an error
  - If base or quote already equals the regulation currency, direct conversion applies (no transit needed)
- Transit calculation converts amount through intermediate currency, not the rate directly
  - Example: 1,000 USD → JPY → EUR, chaining two rate lookups
  - Viktoryia flagged this as a high-risk area: transit math must be validated against real bank data

# Testing Priorities

- Must verify both save and update paths on currency orders
- Transit currency test cases flagged as critical
  - Use real bank rate data for a specific date to validate triangulated output
  - Confirm the engine produces the same result as the bank’s own calculation
- Artur to add the currency order flow to Bruin documentation when time allows
- Viktoryia offered a dedicated session on transit currency edge cases when Vadym reaches that testing phase