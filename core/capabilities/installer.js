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

const manifestModule = require("./manifest");
const validator = require("./validator");
const registry = require("./registry");
const lifecycle = require("./lifecycle");
const log = require("../logging");


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


module.exports = { install, completeInstall, uninstall, healthCheck };
