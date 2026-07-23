// ==================================
// VERONICA CAPABILITY INSTALLER
// ==================================
//
// Phase 20. The actual install pipeline: manifest -> validate -> backup
// snapshot -> register -> health check -> activate (or roll back).
// Reuses the existing approval pipeline (core/executive/actionProposal.js)
// for any package whose manifest sets `"approvalRequired": true` --
// exactly like Phase 19's create_github_issue/post_discord_message, NOT
// a second approval mechanism. core/executive/actionProposal.js requires
// this file (for its "install_capability" external action case), and
// this file needs to create a proposal for approval-required installs --
// both requires are lazy, inside function bodies, to avoid a circular
// top-level require between core/executive and core/capabilities (same
// convention core/automation/jobs.js already established).

const path = require("path");

const manifestModule = require("./manifest");
const validator = require("./validator");
const registry = require("./registry");
const lifecycle = require("./lifecycle");
const log = require("../logging");

const REPO_ROOT = path.join(__dirname, "..", "..");

// A real bug, found live (not in a test) the first time a Phase 35
// package's full approve -> executeExternal -> completeInstall path
// actually ran end to end: a relative packageDir (e.g. "packages/finance",
// exactly what a caller naturally types) works fine for
// manifestModule.loadManifest()/validator.validate() (both use
// fs.existsSync()/fs.readFileSync(), which resolve a relative path
// against process.cwd()) -- but healthCheck() below calls require() on
// the SAME relative string, and Node's require() treats a bare
// "packages/finance/agents/x.js" (no "./" prefix) as a NODE_MODULES
// package specifier, not a cwd-relative path, so it fails with
// "Cannot find module." Worse, an approvalRequired package's relative
// packageDir gets persisted verbatim into the proposal's payload (and,
// once installed, into registry.js's own `source` field, which
// core/capabilities/activation.js later path.join()s for dynamic
// loading) -- so the bug wouldn't surface until whenever the proposal
// was actually approved, potentially long after the relative string was
// typed. Resolving to an absolute path here, once, at both real entry
// points, closes it for every caller and every already-persisted
// proposal, not just new ones.
function resolvePackageDir(packageDir){
    return path.isAbsolute(packageDir) ? packageDir : path.resolve(REPO_ROOT, packageDir);
}


// A real health check, not a rubber stamp: actually require()s every
// file the manifest points at (agent prompts, tool handlers) so a
// syntax/runtime error in the package's own code is caught HERE, before
// activation, rather than the first time something tries to use it live.
function healthCheck(manifest, packageDir){

    const errors = [];

    for(const agent of manifest.agents){
        try {
            require(validator.agentPromptPath(packageDir, agent.name));
        } catch(error){
            errors.push(`Agent "${agent.name}" failed to load: ${error.message}`);
        }
    }

    for(const tool of manifest.tools){
        try {
            require(validator.toolHandlerPath(packageDir, tool.id));
        } catch(error){
            errors.push(`Tool "${tool.id}" failed to load: ${error.message}`);
        }
    }

    return { healthy: errors.length === 0, errors };

}


// Shared by both the direct (no-approval-needed) path and the approved-
// proposal execution path below -- validate, snapshot, register,
// health-check, activate; roll back to the pre-install snapshot on any
// failure rather than leaving a half-installed capability behind.
function completeInstall(packageDir){

    packageDir = resolvePackageDir(packageDir);

    const manifest = manifestModule.loadManifest(packageDir);
    const { valid, errors } = validator.validate(manifest, packageDir);

    if(!valid){
        throw new Error(`Cannot install "${manifest.name}": ${errors.join("; ")}`);
    }

    const snapshot = registry.snapshot();

    try {

        registry.register({
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            status: "installed",
            source: packageDir,
            manifest
        });

        const health = healthCheck(manifest, packageDir);

        if(!health.healthy){
            throw new Error(`Health check failed: ${health.errors.join("; ")}`);
        }

        lifecycle.activate(manifest.name, "Installed and activated");

        log.info("capabilities", `Installed and activated "${manifest.name}" v${manifest.version}`);

        return registry.get(manifest.name);

    } catch(error){

        lifecycle.rollback(snapshot);
        log.error("capabilities", `Install of "${manifest.name}" failed, rolled back: ${error.message}`);
        throw error;

    }

}


// The entry point a caller (a terminal command, a future "VERONICA,
// create a trading division" intent handler) actually calls.
// approvalRequired packages stop at a PENDING proposal -- nothing is
// registered or activated until a human approves it, matching this
// phase's "no autonomous self-modification without approval" ask.
function install(packageDir){

    packageDir = resolvePackageDir(packageDir);

    const manifest = manifestModule.loadManifest(packageDir);

    if(manifest.approvalRequired){

        // Lazy require -- see this file's header comment.
        const ActionProposalEngine = require("../executive/actionProposal");
        const proposalEngine = new ActionProposalEngine();

        const proposal = proposalEngine.proposeExternalAction({
            action: "install_capability",
            reason: `Install capability "${manifest.name}" v${manifest.version} (${manifest.description})`,
            payload: { packageDir }
        });

        log.info("capabilities", `Install of "${manifest.name}" requires approval -- proposal ${proposal.id} created`);

        return { pending: true, proposal };

    }

    return { pending: false, capability: completeInstall(packageDir) };

}


function uninstall(name){
    return registry.remove(name);
}


// Phase 24 (VERONICA Self-Management): capability upgrades, with the
// same backup-snapshot/health-check/rollback safety as a fresh install
// -- upgrading is really "replace the registered entry with a newer
// manifest," so it reuses the same validate -> register -> health-check
// -> activate sequence, just after temporarily removing the old entry
// (validator.validate() would otherwise reject re-registering a name
// that's already installed). Any failure restores the snapshot taken
// BEFORE removal, so a bad upgrade leaves the old version installed and
// active, never half-upgraded.
function upgrade(name, packageDir){

    packageDir = resolvePackageDir(packageDir);

    const existing = registry.requireCapability(name);

    if(existing.core){
        throw new Error(`Capability "${name}" is a built-in, not a package -- it cannot be upgraded`);
    }

    const manifest = manifestModule.loadManifest(packageDir);

    if(manifest.name !== name){
        throw new Error(`Package at "${packageDir}" declares name "${manifest.name}", not "${name}"`);
    }

    const snapshot = registry.snapshot();

    try {

        registry.remove(name);

        const { valid, errors } = validator.validate(manifest, packageDir);

        if(!valid){
            throw new Error(`Cannot upgrade "${name}": ${errors.join("; ")}`);
        }

        registry.register({
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            status: "installed",
            source: packageDir,
            manifest
        });

        const health = healthCheck(manifest, packageDir);

        if(!health.healthy){
            throw new Error(`Health check failed: ${health.errors.join("; ")}`);
        }

        lifecycle.activate(manifest.name, `Upgraded from v${existing.version} to v${manifest.version}`);

        log.info("capabilities", `Upgraded "${name}" from v${existing.version} to v${manifest.version}`);

        return registry.get(name);

    } catch(error){

        lifecycle.rollback(snapshot);
        log.error("capabilities", `Upgrade of "${name}" failed, rolled back to v${existing.version}: ${error.message}`);
        throw error;

    }

}


module.exports = { install, completeInstall, uninstall, upgrade, healthCheck };
