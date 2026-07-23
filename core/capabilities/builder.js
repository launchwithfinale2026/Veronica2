// ==================================
// VERONICA INTERNAL PACKAGE BUILDER
// ==================================
//
// Phase 27. Generates a new capability package's real files on disk --
// manifest.json, agent prompt SKELETONS, tool handler SKELETONS, an
// optional department manager.js, a real (if minimal) validation test,
// and a README -- from reusable templates, not duplicated per package.
//
// IMPORTANT: this produces SKELETONS, not working capabilities. A
// generated agent's system prompt and a generated tool's handler both
// explicitly say so (the tool throws if actually called) -- exactly
// this phase's own framing ("Agent Skeletons," "Tool Skeletons"), not
// "VERONICA writes a fully working HR department." Claiming otherwise
// would be exactly the fabrication Phase 19/20 were explicit about
// avoiding. A generated skeleton passes validator.validate() (every
// declared file exists) and installer.js's health check (every file
// require()s without a syntax error) -- it does NOT mean the capability
// actually does anything useful yet. That's real, subsequent
// implementation work, by a human or a future engine, not this one.
//
// Every template is a small function, applied once per agent/tool
// declared -- "no duplicated code generation" per this phase's own
// ask.

const fs = require("fs");
const path = require("path");

const validator = require("./validator");

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

// The exact substring every generated skeleton tool's thrown error
// message contains -- exported so core/capabilities/health.js can
// detect "this tool is still a skeleton" by reading the handler
// function's own source (Function.prototype.toString()) rather than
// hardcoding a second copy of this string, or actually invoking a
// possibly side-effecting handler just to see if it throws.
const SKELETON_MARKER = "is a generated skeleton -- implement its real behavior";


function requireValidName(name){

    if(!name || !NAME_PATTERN.test(name)){
        throw new Error(`Invalid package name "${name}" -- must be lowercase, start with a letter, and contain only letters/numbers/hyphens`);
    }

}


function agentPromptTemplate({ identity, mission }){

    return `module.exports = {

    identity: ${JSON.stringify(identity)},

    mission: ${JSON.stringify(mission)},

    system:
\`
You are ${identity}, a generated SKELETON agent (see core/capabilities/builder.js) -- this system
prompt is a placeholder, not a real one. Replace this with ${identity}'s
actual responsibilities and operating principles for "${mission}" before
relying on this agent for anything real.
\`

};
`;

}


function toolHandlerTemplate(toolId){

    return `// Generated SKELETON tool handler (see core/capabilities/builder.js) --
// this throws on purpose. Replace the body below with ${toolId}'s real
// behavior before installing this package for real use.

module.exports = {

    ${JSON.stringify(toolId)}: async () => {
        throw new Error(${JSON.stringify(`Tool "${toolId}" ${SKELETON_MARKER} in this file before use.`)});
    }

};
`;

}


// Same manager.js factory convention departments/<id>/manager.js
// already follows. The require path is computed from the REAL location
// of core/departments/base.js relative to where this specific package
// actually lives (packageDir) -- not a hardcoded "3 levels up" guess,
// since a caller can install packages under a non-default outputRoot
// (buildPackage()'s own `outputRoot` option, used by this module's own
// tests) where that guess would be wrong.
function departmentManagerTemplate(packageDir){

    const requirePath = toRequirePath(
        path.join(packageDir, "department"),
        path.join(__dirname, "..", "departments", "base.js")
    );

    return `const DepartmentManager = require(${JSON.stringify(requirePath)});

module.exports = (config) => new DepartmentManager(config);
`;

}


// Node require() paths always use forward slashes and drop the trailing
// ".js" -- path.relative() alone gives neither on its own (and gives
// backslashes on Windows), and a same-directory relative path needs an
// explicit "./" prefix or require() treats it as a bare module
// specifier.
function toRequirePath(fromDir, toFile){

    const relative = path.relative(fromDir, toFile).replace(/\.js$/, "").split(path.sep).join("/");

    return relative.startsWith(".") ? relative : `./${relative}`;

}


// A real, generic, reusable test -- not a fabricated "it works" claim.
// Runs validator.validate() against the package's own real directory,
// the same check installer.install() itself performs, so a generated
// package has at least one real, passing test from the moment it's
// created. Require paths are computed the same dynamic way as
// departmentManagerTemplate() above, for the same reason.
function testSkeletonTemplate({ name, packageDir }){

    const testsDir = path.join(packageDir, "tests");
    const manifestRequirePath = toRequirePath(testsDir, path.join(__dirname, "manifest.js"));
    const validatorRequirePath = toRequirePath(testsDir, path.join(__dirname, "validator.js"));

    return `const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const manifestModule = require(${JSON.stringify(manifestRequirePath)});
const validator = require(${JSON.stringify(validatorRequirePath)});

const PACKAGE_DIR = path.join(__dirname, "..");


test(${JSON.stringify(`${name} package's manifest is valid (generated skeleton smoke test)`)}, () => {

    const manifest = manifestModule.loadManifest(PACKAGE_DIR);
    const result = validator.validate(manifest, PACKAGE_DIR);

    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.valid, true);

});
`;

}


function readmeTemplate({ name, description, agents, tools, department }){

    const agentLines = agents.length
        ? agents.map(a => `- \`${a.name}\` (${a.role || "role not set"}) -- agents/${a.name.toLowerCase()}.js`).join("\n")
        : "(none declared)";

    const toolLines = tools.length
        ? tools.map(t => `- \`${t.id}\` -- tools/${t.id}.js`).join("\n")
        : "(none declared)";

    return `# ${name}

${description}

**This package was generated by core/capabilities/builder.js (Phase 27)
as a SKELETON.** Every agent/tool file it created is a real, loadable
placeholder that throws/says so if actually used -- none of it is
working capability yet. Before installing this for real use:

1. Replace each agent's system prompt in \`agents/\` with real
   responsibilities.
2. Replace each tool handler's body in \`tools/\` with real behavior.
${department ? "3. Fill in \`department/manager.js\` if this department needs anything beyond the standard DepartmentManager base -- most don't.\n" : ""}
## Agents
${agentLines}

## Tools
${toolLines}

## Memory

This package's own memories should be tagged with
\`core/capabilities/activation.js\`'s \`namespaceTagFor("${name}")\` (i.e.
the tag \`"capability:${name}"\`) so they're filterable without a new
storage mechanism -- see that file's own comment.

## Dashboard

There is no dynamic dashboard-panel plugin system yet (see
docs/NEXT_STEPS.md) -- a real dashboard view for this package means
extending dashboard/frontend/index.html and app.js directly, the same
way every existing panel was added.

## Installing

\`\`\`js
const installer = require("core/capabilities/installer");
installer.install("${path.join("packages", name)}");
\`\`\`
`;

}


// The actual generation step -- writes every file for real, using the
// templates above. Returns the manifest and the list of files created,
// but does NOT install/activate anything (see buildAndInstall() below
// for that) -- generation and installation are separate, single-
// responsibility steps, same reasoning installer.js's own
// completeInstall()/install() split follows.
function buildPackage({ name, description, agents = [], tools = [], department = null, dependencies = [], permissions = [], approvalRequired = false, outputRoot } = {}){

    requireValidName(name);

    if(!description){
        throw new Error("A description is required");
    }

    const packagesRoot = outputRoot || path.join(__dirname, "..", "..", "packages");
    let packageDir = path.join(packagesRoot, name);

    if(fs.existsSync(packageDir)){
        throw new Error(`A directory already exists at "${packageDir}" -- choose a different name or remove it first`);
    }

    const filesCreated = [];

    fs.mkdirSync(packageDir, { recursive: true });

    // Normalizes away any symlink discrepancy between the path just
    // created and the path Node's own module resolver will actually see
    // (e.g. on macOS, os.tmpdir() returns "/var/folders/..." but
    // require() resolves through the realpath "/private/var/folders/...") --
    // every relative require() path this function's templates compute
    // below is computed FROM this realpath, so it's correct regardless
    // of which form the caller's outputRoot happened to be given in.
    packageDir = fs.realpathSync(packageDir);

    if(agents.length){

        fs.mkdirSync(path.join(packageDir, "agents"));

        for(const agent of agents){
            const filePath = path.join(packageDir, "agents", `${agent.name.toLowerCase()}.js`);
            fs.writeFileSync(filePath, agentPromptTemplate({ identity: agent.name, mission: agent.role || description }));
            filesCreated.push(filePath);
        }

    }

    if(tools.length){

        fs.mkdirSync(path.join(packageDir, "tools"));

        for(const tool of tools){
            const filePath = path.join(packageDir, "tools", `${tool.id}.js`);
            fs.writeFileSync(filePath, toolHandlerTemplate(tool.id));
            filesCreated.push(filePath);
        }

    }

    if(department){

        fs.mkdirSync(path.join(packageDir, "department"));
        const filePath = path.join(packageDir, "department", "manager.js");
        fs.writeFileSync(filePath, departmentManagerTemplate(packageDir));
        filesCreated.push(filePath);

    }

    const manifest = {
        name, description, version: "0.1.0",
        agents, tools, dependencies, permissions,
        ...(department ? { department } : {}),
        approvalRequired
    };

    const manifestPath = path.join(packageDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
    filesCreated.push(manifestPath);

    fs.mkdirSync(path.join(packageDir, "tests"));
    const testPath = path.join(packageDir, "tests", `${name}.test.js`);
    fs.writeFileSync(testPath, testSkeletonTemplate({ name, packageDir }));
    filesCreated.push(testPath);

    const readmePath = path.join(packageDir, "README.md");
    fs.writeFileSync(readmePath, readmeTemplate({ name, description, agents, tools, department }));
    filesCreated.push(readmePath);

    // Real, not a fabricated pass -- the generated manifest/files are
    // validated the SAME way installer.install() will validate them for
    // real later. A generator bug that produced an invalid package would
    // surface here, immediately, not silently at install time.
    const validation = validator.validate({ ...manifest, agents, tools, dependencies }, packageDir);

    if(!validation.valid){
        throw new Error(`Generated package failed its own validation: ${validation.errors.join("; ")}`);
    }

    return { name, packageDir, manifest, filesCreated };

}


// The full pipeline this phase describes (Intent -> ... -> Installation
// -> Activation), for a caller that wants build+install in one call --
// reuses installer.js's EXISTING install() unconditionally (including
// its approval-gating for approvalRequired packages), never a second
// installation path.
function buildAndInstall(options){

    const built = buildPackage(options);

    // Lazy require: installer.js doesn't require builder.js today, so
    // this isn't circular yet -- kept lazy anyway for the same
    // defensive consistency every other cross-module require in
    // core/capabilities/ already follows.
    const installer = require("./installer");

    return { ...built, install: installer.install(built.packageDir) };

}


module.exports = { buildPackage, buildAndInstall, requireValidName, SKELETON_MARKER };
