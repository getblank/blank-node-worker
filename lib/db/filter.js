const configStore = require("../configStore");
const db = require("./rawDb");
const iso8601 = /^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d(\.\d{1,3})?(Z|[\+-][012]\d\:[012]\d)$/;

const prepare = async (storeDesc, query, user) => {
    const res = Object.assign({}, query);
    const filters = storeDesc.filters || {};
    if (!query) {
        query = {};
    }

    for (const _queryName of Object.keys(query)) {
        const filter = filters[_queryName];
        if (!filter || !filter.query) {
            validateQueryPart(res[_queryName]);
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

    const accessQuery = await configStore.getMongoAccessQuery(storeDesc, user);
    if (accessQuery) {
        res.$and = (res.$and || []).concat([accessQuery]);
    }

    return res;
};

const validateQueryPart = part => {
    if (part === null) {
        return;
    }
    if (Array.isArray(part)) {
        for (let p of part) {
            validateQueryPart(p);
        }
        return;
    }
    if (typeof part === "object") {
        for (let key of Object.keys(part)) {
            if (typeof part[key] === "object" || Array.isArray(part[key])) {
                validateQueryPart(part[key]);
                continue;
            }
            if (typeof part[key] === "string" && iso8601.test(part[key])) {
                part[key] = new Date(part[key]);
            }
        }
    }
};

module.exports = {
    prepare,
};
