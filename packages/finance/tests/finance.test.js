const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const manifestModule = require("../../../core/capabilities/manifest");
const validator = require("../../../core/capabilities/validator");

const PACKAGE_DIR = path.join(__dirname, "..");


test("finance package's manifest is valid (generated skeleton smoke test)", () => {

    const manifest = manifestModule.loadManifest(PACKAGE_DIR);
    const result = validator.validate(manifest, PACKAGE_DIR);

    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.valid, true);

});
