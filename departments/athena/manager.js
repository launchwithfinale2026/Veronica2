const DepartmentManager = require("../../core/departments/base");

function createManager(config){
    return new DepartmentManager(config);
}

module.exports = createManager;
