const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

// Phase 35 (Production Capability Packages): real, generated packages
// for six business domains (see docs/CHANGELOG.md for the full list).
// Each is `approvalRequired: true` and deliberately left as a real,
// unapproved pending proposal in the actual capability registry/memory
// (not test-isolated state) -- installing/activating them is a genuine
// human decision, not something this suite (or this session) makes for
// the operator. This file only verifies each package's real manifest is
// valid and stays that way -- it does NOT install or approve any of
// them, and touches no shared test-isolated state that would need
// backup/restore.

const manifestModule = require("../core/capabilities/manifest");
const validator = require("../core/capabilities/validator");
const registry = require("../core/capabilities/registry");

const PRODUCTION_PACKAGES = [
    "business-operations", "marketing", "sales",
    "research-department", "finance", "trading-research"
];


for(const name of PRODUCTION_PACKAGES){

    test(`packages/${name} has a real, valid manifest (agents/tools/department all load cleanly)`, () => {

        const packageDir = path.join(__dirname, "..", "packages", name);
        const manifest = manifestModule.loadManifest(packageDir);

        assert.strictEqual(manifest.name, name);
        assert.strictEqual(manifest.approvalRequired, true);
        assert.ok(manifest.agents.length > 0);

        // isInstalled(name) may be true or false depending on whether an
        // operator has approved/installed it on THIS machine already --
        // validate() would otherwise report "already installed" as an
        // error for an already-approved package, which isn't a real
        // manifest problem. Filtering that one specific, expected message
        // out keeps this test meaningful regardless of install state.
        const { errors } = validator.validate(manifest, packageDir);
        const realErrors = errors.filter(e => !e.includes("already installed"));

        assert.deepStrictEqual(realErrors, []);

    });

}


test("every production package is either pending approval or installed -- never silently missing from the system", () => {

    const pendingReasons = require("../core/executive/actionProposal");
    const ActionProposalEngine = pendingReasons;
    const engine = new ActionProposalEngine();

    const pending = engine.list("pending").filter(p => p.action === "install_capability");
    const pendingNames = pending.map(p => {
        const match = p.reason.match(/Install capability "([^"]+)"/);
        return match ? match[1] : null;
    });

    for(const name of PRODUCTION_PACKAGES){
        const installedOrActive = registry.isInstalled(name);
        const isPending = pendingNames.includes(name);
        assert.ok(installedOrActive || isPending, `expected "${name}" to be either installed or pending approval, found neither`);
    }

});
