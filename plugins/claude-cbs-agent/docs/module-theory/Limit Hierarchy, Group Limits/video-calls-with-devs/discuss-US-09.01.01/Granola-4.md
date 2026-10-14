# Negative Regression: Group Credit Limit Flag Cases

- Case: Company Credit Limit + Group flag set to false
  - If flag is false, a group cannot exist, so the case is invalid
  - Deleted: logically impossible state
- Case: Draft created with flag true, then flag disabled, then draft moved to AUS
  - Flag can be disabled if no groups exist in Live (only in NAU)
  - Valid case: kept

# Customer Validation Cases

- Non-existent customer added: error expected, case valid
- Inactive customer (status Closed or Suspended) added
  - Not currently checked; likely a bug
  - Valid case: needs to be added
- Active individual (физлицо) added to group
  - Artur confirmed with Andrey: no restriction planned, only legal entities (юрлица) intended but not enforced
  - Removed from validation logic; Anastasiya to update

# Mixed and Parallel Request Cases

- Mixed list: valid customer with debt (5,000) + non-existent customer
  - Entire request rejected; error = “customer does not exist”
- Two errors in one request: non-existent customer + customer from another group
  - Only the first error encountered is returned (no error aggregation)
- Parallel AUS of two drafts with one shared customer
  - N10 case: depends on atomicity feature (not yet implemented); group likely overwrites on conflict

# Credit Limit Boundary Cases

- Group at limit (Total OZ = 400,000): customer with debt 0.1 + customer with no debt
  - Two separate requests: one accepted, one rejected
  - Single combined request: both rejected
- Group capacity exceeded mid-flow: OZ grew to 396,000, adding 5 more pushes over 400,000
  - Live version stays empty; Total OZ = 396,000
- Group with two limits: sub-product passes (11,400), but product limit exceeded
  - Full hierarchy checked on validation
- Group with no records in LiLimit: customer with debt 5,000 not added (400 limit)

# Cases Removed

- Customer Party service case: service not reachable / not yet developed, deleted
- Individual (физлицо) restriction case: no restriction confirmed by Andrey, removed from validation
- Group flag false + add customer case: logically impossible, deleted

# Next Steps

- **Add test case for inactive customer (Closed/Suspended status)**
- **Remove individual (физлицо) restriction from validation logic** (Anastasiya)