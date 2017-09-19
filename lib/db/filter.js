const configStore = require("../configStore");
const db = require("./rawDb");

const prepare = async (storeDesc, query, user) => {
    const res = Object.assign({}, query);
    const filters = storeDesc.filters || {};
    for (let _queryName of Object.keys(res || {})) {
        let filter = filters[_queryName];
        if (!filter || !filter.query) {
            this._validateQueryPart(res[_queryName]);
            continue;
        }

        let calculatedQuery;
        if (typeof filter.query === "function") {
            try {
                calculatedQuery = filter.query(res[_queryName]);
                if (calculatedQuery instanceof Promise) {
                    calculatedQuery = await calculatedQuery;
                }
            } catch (err) {
                console.error(`[$db][find] query "${_queryName}" evaluating error`, err);
            }
        } else {
            calculatedQuery = db._compileQuery(filter.query, res[_queryName]);
        }

        res.$and = res.$and || [];
        if (calculatedQuery) {
            res.$and.push(calculatedQuery);
        }

        delete res[_queryName];
    }

    const accessQuery = configStore.getMongoAccessQuery(storeDesc, user);
    if (accessQuery) {
        res.$and = (res.$and || []).concat([accessQuery]);
    }

    return res;
};

module.exports = {
    prepare,
};