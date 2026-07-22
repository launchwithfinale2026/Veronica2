// ==================================
// VERONICA IDENTITY / PERMISSIONS
// ==================================
//
// Reads identity/roles.json and identity/permissions.json and answers
// "does this role have this permission?" — the enforcement layer that
// was previously missing (identity/*.json existed but nothing read it).

const fs = require("fs");
const path = require("path");

const ROLES_FILE = path.join(__dirname, "../../identity/roles.json");
const PERMISSIONS_FILE = path.join(__dirname, "../../identity/permissions.json");


function loadRoles(){

    return JSON.parse(
        fs.readFileSync(ROLES_FILE, "utf8")
    ).roles;

}


function loadPermissions(){

    return JSON.parse(
        fs.readFileSync(PERMISSIONS_FILE, "utf8")
    ).permissions;

}


function permissionsForRole(roleId){

    const role = loadRoles().find(r => r.id === roleId);

    return role ? role.permissions : [];

}


function hasPermission(roleId, permission){

    return permissionsForRole(roleId).includes(permission);

}


module.exports = {

    loadRoles,

    loadPermissions,

    permissionsForRole,

    hasPermission

};
