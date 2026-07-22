// Filesystem access is deliberately sandboxed to data/workspace/ rather
// than the real filesystem — an agent-controlled path reaching an
// unrestricted fs.readFile/writeFile is a real vulnerability (path
// traversal, overwriting project files). Every path is resolved against
// the sandbox root and rejected if it would resolve outside it.

const fs = require("fs");
const path = require("path");

const SANDBOX_ROOT = path.join(__dirname, "../../../data/workspace");


function resolveSafePath(relativePath){

    if(typeof relativePath !== "string" || !relativePath){
        throw new Error("A relative file path is required");
    }

    const resolved = path.resolve(SANDBOX_ROOT, relativePath);

    const withinSandbox =
        resolved === SANDBOX_ROOT ||
        resolved.startsWith(SANDBOX_ROOT + path.sep);

    if(!withinSandbox){
        throw new Error(
            `Path escapes the sandboxed workspace: "${relativePath}"`
        );
    }

    return resolved;

}


module.exports = {

    "filesystem.readFile": ({ path: relativePath } = {}) => {

        const target = resolveSafePath(relativePath);

        return fs.readFileSync(target, "utf8");

    },

    "filesystem.writeFile": ({ path: relativePath, content } = {}) => {

        const target = resolveSafePath(relativePath);

        fs.mkdirSync(path.dirname(target), { recursive: true });

        fs.writeFileSync(target, content ?? "");

        return { status: "written", path: relativePath };

    }

};
