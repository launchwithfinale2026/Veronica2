// Reference tool handler for the "example" capability package -- see
// packages/example/manifest.json. Deliberately trivial: it exists to
// prove a package-provided tool can really execute once installed, not
// to do real work.

module.exports = {

    "example.ping": async () => ({ pong: true, at: new Date().toISOString() })

};
