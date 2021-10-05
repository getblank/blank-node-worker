const configStore = require("../configStore");
const db = require("./mongoDB");
const UserError = require("../userError");
const iso8601 = /^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d(\.\d{1,3})?(Z|[\+-][012]\d\:[012]\d)$/;

const prepare = async (storeDesc, query, user) => {
    if (typeof query === "string" || typeof query === "number") {
        query = { _id: query };
    }

    const res = Object.assign({}, query);
    const filters = storeDesc.filters || {};
    if (!query) {
        query = {};
    }

    for (const _queryName of Object.keys(query)) {
        const val = res[_queryName];
        if (Array.isArray(val) && val.length > 0) {
            if (typeof val[0] === "object" && val[0] !== null) {
                for (let i = 0; i < val.length; i++) {
                    val[i] = await prepare(storeDesc, val[i], user);
                }

                continue;
            }
        }

        const filter = filters[_queryName];
        if (!filter || !filter.query) {
            validateQueryPart(val);
            continue;
        }

        let calculatedQuery;
        if (typeof filter.query === "function") {
            try {
                calculatedQuery = await filter.query(val, user);
            } catch (err) {
                console.error(`[$db][find] query "${_queryName}" evaluating error`, err);
                if (err instanceof UserError) {
                    throw err;
                }
            }
        } else {
            calculatedQuery = db._compileQuery(filter.query, val);
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

const validateQueryPart = (part) => {
    if (part === null) {
        return;
    }

    if (Array.isArray(part)) {
        for (const p of part) {
            validateQueryPart(p);
        }
        return;
    }

    if (typeof part === "object") {
        for (const key of Object.keys(part)) {
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
