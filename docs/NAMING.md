# Product names and compatibility

OpenPoker names the shared software. DanGG names the reference client and private integration.
The current client deliberately retains DanGG logos and icons; a public repository name is not
an instruction to replace that service identity.

The server startup label now says OpenPoker. Fresh desktop profiles use `DanGG`; existing
`GGPoker Clone` profiles are reused in place so an update cannot silently abandon databases,
sessions or desktop mode. An explicit `GGPOKER_USER_DATA` path continues to take precedence.
Current layout/engine comments describe behavior rather than calling this a GGPoker clone.

Some old strings remain intentionally:

- `GGPOKER_*` environment variables are deployed configuration interfaces.
- `ggpoker.*` browser storage keys retain login and preferences; settings sync and test tools
  use the same namespace. Renaming only one caller would log users out or lose settings.
- `ggpoker.db` and the existing desktop profile are persisted data locations.
- Legacy display-name migration inputs and tests must still recognise old installations.
- Historical research, competitor comparisons, non-affiliation statements, source links and
  third-party provenance must name the actual original product. They are not current branding.

Do not mechanically replace those strings. A future namespace migration needs explicit alias
precedence, old/new-version interoperability, logout/removal semantics, settings sync coverage,
backup/restore behavior and sandbox credential-filter tests. Never rename an existing database
or profile as a cosmetic step. This cleanup does not claim every historical identifier is gone.
