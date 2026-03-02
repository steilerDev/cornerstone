# EPIC-08: Paperless-ngx Document Integration — Planning Notes

## Stories

| #   | Issue | Title                                | Priority    | Status  | Depends On          |
| --- | ----- | ------------------------------------ | ----------- | ------- | ------------------- |
| 8.1 | #354  | Paperless-ngx Proxy Service          | Must Have   | Todo    | (none)              |
| 8.2 | #355  | Document Links Schema & CRUD API     | Must Have   | Backlog | #354                |
| 8.3 | #356  | Document Browser & Search UI         | Must Have   | Backlog | #354                |
| 8.4 | #357  | Document Linking for Work Items      | Must Have   | Backlog | #355, #356          |
| 8.5 | #358  | Document Linking for Invoices        | Must Have   | Backlog | #355, #356          |
| 8.6 | #359  | Document Linking for Household Items | Must Have   | Backlog | #355, #356, EPIC-04 |
| 8.7 | #360  | Responsive & Accessibility Polish    | Should Have | Backlog | #356, #357, #358    |

## Dependency Chain

```
8.1 (proxy) ─┬─> 8.2 (schema/API) ─┬─> 8.4 (work items linking)  ─┬─> 8.7 (polish)
              │                      ├─> 8.5 (invoice linking)      ─┤
              │                      └─> 8.6 (household linking)*    │
              └─> 8.3 (browser UI) ──┼─> 8.4                        │
                                     ├─> 8.5                        ─┘
                                     └─> 8.6*

* 8.6 also blocked by EPIC-04 (Household Items not yet implemented)
```

## Key Design Decisions

1. **Proxy pattern**: All Paperless-ngx requests go through Fastify server. No direct client-to-Paperless-ngx communication. (Architecture wiki)
2. **Polymorphic document links**: Single `document_links` table with `entity_type` + `entity_id` supporting work_item, invoice, household_item. Architect decides exact schema.
3. **Reusable document browser**: Story 8.3 creates a component usable both as the /documents page and as a modal picker in Stories 8.4/8.5/8.6.
4. **Graceful degradation**: When Paperless-ngx is unconfigured or unreachable, UI shows clear messages. API returns link records with null metadata.
5. **EPIC-04 dependency**: Story 8.6 (household items linking) explicitly blocked by EPIC-04. Schema in 8.2 supports household_item entity type proactively.
6. **Environment variables**: `PAPERLESS_URL` and `PAPERLESS_TOKEN` (optional, commented out in .env.example).

## Requirements Coverage

| Requirement Section                       | Covered By             |
| ----------------------------------------- | ---------------------- |
| 2.2 Document Integration                  | 8.1, 8.2, 8.3          |
| 2.1 Work Items - Document links           | 8.4                    |
| 2.3 Household Items - Document links      | 8.6                    |
| 3.2 Paperless-ngx Integration             | 8.1, 8.2               |
| 4 User Stories - link docs to work items  | 8.4                    |
| 4 User Stories - link invoices/receipts   | 8.5                    |
| 4 User Stories - link household docs      | 8.6                    |
| 5 Key Decisions - no built-in doc storage | All (no local storage) |
