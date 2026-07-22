// Unlike core/tools/handlers/executive.js/company.js/learning.js/
// automation.js, these can be required at the top level -- neither
// core/integrations/obsidian.js (memory + knowledge only) nor
// core/integrations/http.js (Node's http/https only) has any dependency
// chain back through core/intelligence -> core/brain -> core/tools, so
// there's no circular-require risk to guard against here.

const obsidian = require("../../integrations/obsidian");
const externalHttp = require("../../integrations/http");

module.exports = {

    "obsidian.list": () => obsidian.listNotes(),

    "obsidian.read": ({ path } = {}) => {

        if(!path){
            throw new Error("A note path is required");
        }

        return obsidian.readNote(path);

    },

    "obsidian.write": ({ path, content } = {}) => {

        if(!path){
            throw new Error("A note path is required");
        }

        return obsidian.writeNote(path, content);

    },

    "obsidian.index": () => obsidian.indexVault(),

    "web.fetch": async ({ url, method, body, headers } = {}) => {

        if(!url){
            throw new Error("A url is required");
        }

        return externalHttp.request(url, { method, body, headers });

    }

};
