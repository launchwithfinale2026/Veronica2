# marketing

Marketing department -- campaign management, content strategy, and analytics, matching core/capabilities/planner.js's "marketing" capability catalog entry.

**Genuinely active as of Phase 41 (Marketing Division production-
readiness).** This package started as a `core/capabilities/builder.js`
(Phase 27) generated skeleton, but is no longer one:
`marketing.campaign.plan` has a real implementation (creates a real
campaign via `core/marketing/campaigns.js`), and every agent below has a
real system prompt reflecting its actual place in the division's
reporting chain. `core/capabilities/health.js` reports this package's
`operationalStatus` as `"active"`, not `"installed_awaiting_integration"`
-- see `tests/capabilities-health.test.js`.

The real Marketing Division architecture lives in `core/marketing/`
(`campaigns.js`, `contentGenerator.js`, `analytics.js`) and
`core/executive/companyManager.js` (Brand Profile / Company Brain), not
in this package's own files -- this package is the agent/tool/department
scaffold that exposes that architecture through VERONICA's normal
capability system, following the same pattern every other package here
already established.

## Agents (reporting chain: Executive Core -> MarketingDirector -> ... )
- `MarketingDirector` (Marketing Director) -- agents/marketingdirector.js
- `CampaignManager` (Campaign Manager) -- agents/campaignmanager.js
- `ContentStrategist` (Content Strategist) -- agents/contentstrategist.js
- `BrandManager` (Brand Manager) -- agents/brandmanager.js
- `PublishingManager` (Publishing Manager) -- agents/publishingmanager.js
- `MarketingAnalyticsAgent` (Analytics Agent) -- agents/marketinganalyticsagent.js

## Tools
- `marketing.campaign.plan` -- tools/marketing.campaign.plan.js. Real:
  creates a campaign via `core/marketing/campaigns.js`. Needs no external
  API to plan a campaign; publishing one later goes through the real,
  approval-gated Publishing Queue
  (`core/executive/actionProposal.js`'s `publish_content` action), which
  only genuinely works for platforms with a real connector (Discord
  today -- anything else honestly fails until a real connector exists).

## Memory

This package's own memories should be tagged with
`core/capabilities/activation.js`'s `namespaceTagFor("marketing")` (i.e.
the tag `"capability:marketing"`) so they're filterable without a new
storage mechanism -- see that file's own comment. Campaigns themselves
are tagged `"marketing-campaign"` + `company:<id>` (see
`core/marketing/campaigns.js`).

## Dashboard

There is no dynamic dashboard-panel plugin system yet (see
docs/NEXT_STEPS.md) -- a real dashboard view for this package means
extending dashboard/frontend/index.html and app.js directly, the same
way every existing panel was added (see the "Capability Operations"
panel, Phase 41, for the most recent example).

## Installing

```js
const installer = require("core/capabilities/installer");
installer.install("packages/marketing");
```
