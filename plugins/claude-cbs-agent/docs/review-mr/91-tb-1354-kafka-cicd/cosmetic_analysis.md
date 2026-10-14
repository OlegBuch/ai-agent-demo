# Cosmetic Review — MR !91 (TB-1354: Kafka CI/CD wiring)

## Summary

Reviewed all 14 changed files / 873 diff lines (`.env.example`, `.gitlab-ci.yml`, `README.md`,
`api/kafka/tests/kafka-health-check.spec.ts`, `api/types/kafka.types.ts`,
`api/utils/api-fixtures.ts`, `api/utils/db-helper.ts`, `api/utils/group-cleanup-helper.ts`,
`api/utils/kafka-topic-cleanup-helper.ts` → `api/utils/kafka-cleanup-helper.ts` (rename),
`api/utils/paths/kafka-paths.ts`, `api/utils/resource-tracker.ts`,
`api/utils/services/kafka-service.ts`, `package-lock.json`, `package.json`) line-by-line against
`docs/frame-specs/coding-standards.md`, `testing-standards.md`, the tag taxonomy, and the full
`api/utils/`, `api/types/*.types.ts`, `*-api-paths.ts`, and service-class reuse surface.

## Confirmed Issues

**[Confirmed] New `api/utils/paths/kafka-paths.ts` breaks the established `*-api-paths.ts` naming/location pattern**
Every existing sibling path-descriptor file in the reuse surface — `api/utils/keycloak-admin-api-paths.ts`, `api/system_core/sys-core-api-paths.ts`, `api/account/account-api-paths.ts`, `api/utils/user-profile-api-paths.ts`, `api/utils/user-group-api-paths.ts` — is named `<module>-api-paths.ts` and lives directly in `api/utils/` or its owning module folder. `api/utils/paths/kafka-paths.ts:1-9` instead drops the `-api-` infix and introduces a brand-new `paths/` subdirectory with no precedent elsewhere in the codebase.
Fix: rename/move to `api/utils/kafka-api-paths.ts` (or the kafka module's own folder, `<module>-api-paths.ts`), matching every sibling's naming and placement.

**[Confirmed] Added comment on `KafkaService.brokers` restates WHAT instead of WHY**
`api/utils/services/kafka-service.ts:96` — `/** Broker(s) this instance was configured to connect to (from KAFKA_BROKERS or an explicit override). */` restates what the getter returns rather than a hidden constraint/workaround/invariant. Per comment-hygiene convention, any diff-added comment that restates WHAT the code does is blocking regardless of length.
Fix: delete the comment; the getter name plus `KafkaServiceConfig.brokers`/`KAFKA_BROKERS` already make the source self-evident.

**[Confirmed] New Kafka health-check test omits the `@api` layer tag every sibling health-check test carries**
`api/kafka/tests/kafka-health-check.spec.ts:6` — `tag: ['@health-check']` only. Every existing `@health-check`-tagged spec pairs it with the `@api` layer tag: `api/account/tests/api-smoke.spec.ts:7` → `['@health-check', '@api']`, `api/security_management/tests/api-smoke.spec.ts:7` → `['@health-check', '@api']`. This test also exercises a backend service (not UI), so it belongs in the same layer family.
Fix: change the tag array to `['@health-check', '@api']`.

**[Confirmed] Diff-introduced `generateCustomId` prefix uses hyphen-case, inconsistent with the established underscore-separated prefix convention**
`api/utils/services/kafka-service.ts:293` — `generateCustomId('proj-aqa-kafka')`. Every existing `DefaultPrefix` value passed to this same generator is underscore-separated (`api/utils/dynamic-name-generator.ts:5-8`: `CUSTOM_FIELD`, `CUSTOM_TABLE`, `QA_GROUP`, `CUSTOM_ID`), and this very diff's own `README.md:191-192` Usage example calls the same function with underscore-separated prefixes (`generateCustomId('aqa_kafka_topic')`, `generateCustomId('aqa_kafka_corr')`). The hyphenated call is a self-inconsistency introduced by the diff, not just a style preference.
Fix: use an underscore-separated prefix, e.g. `generateCustomId('proj_aqa_kafka')`, to match both the established convention and the diff's own documented usage.

## Possible Risks

**[Possible Risk] README "Usage" example's `expect` lacks the required descriptive message**
`README.md:213` — `expect(payload.event).toBe('MY_EVENT');` has no second-argument message, while `testing-standards.md` requires every assertion to carry one. This block is documentation/example code rather than an executable spec, so it isn't a mechanical violation in its own right — but the surrounding text (`README.md:189-190`) explicitly instructs engineers to write new Kafka tests "following the pattern above," so an as-written copy-paste would itself violate the assertion-message convention on day one.
Fix: add a descriptive message to the example's `expect`, e.g. `expect(payload.event, 'Expected the consumed message to carry the produced event type').toBe('MY_EVENT');`.

## Nice-to-Have Improvements

No issues detected.

## Reuse-by-Name Duplicate Findings

No issues detected — `generateCustomId` (dynamic-name-generator.ts), `isTestOwnedName` (test-ownership.ts), `KAFKA_UI_VALUES`/`isKafkaUiConfigured` (kafka-ui.values.ts), and the `import type` pattern for all Kafka type-only imports are all reused correctly from their established exports rather than reinvented.
