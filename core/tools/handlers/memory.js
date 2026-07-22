const memory = require("../../memory");

module.exports = {

    "memory.remember": (input) => memory.remember(input),

    "memory.recall": ({ query } = {}) => memory.search(query)

};
