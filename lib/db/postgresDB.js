const snakeCase = require("lodash/snakeCase");
const Sequelize = require("sequelize");
const configStore = require("../configStore");

const { Op } = Sequelize;
const logging = process.env.BLANK_DEBUG ? console.log : () => {};

const getLogStoreDesc = (storeDesc) => ({
    props: {
        _id: { type: "uuid" },
        diff: { type: "any" },
        reverseDiff: { type: "any" },
        itemId: { type: storeDesc.props._id.type },
        ver: { type: "int" },
        prevVer: { type: "int" },
        createdAt: { type: "date" },
        createdBy: { type: "string" },
        actionSource: { type: "any" },
    },
});

const convertPropName = (propName) => {
    return (/^_[a-zA-Z]/.test(propName) ? "_" : "") + snakeCase(propName);
};

const generateSchema = (storeDesc) => {
    const fields = { __v: { type: Sequelize.INTEGER } };
    for (const propName of Object.keys(storeDesc.props)) {
        const propDesc = storeDesc.props[propName];
        const fieldName = convertPropName(propName);
        const field = { field: fieldName, validate: {} };
        switch (propName) {
            case "_id":
                field.primaryKey = true;
                break;
            case "_deleted":
                continue;
        }

        if (propDesc.populated) {
            continue;
        }

        switch (propDesc.type) {
            case "int":
                field.type = Sequelize.INTEGER;
                if (propName === "_id") {
                    field.autoIncrement = true;
                }
                break;
            case "float":
                field.type = Sequelize.FLOAT;
                break;
            case "bool":
                field.type = Sequelize.BOOLEAN;
                break;
            case "string":
                field.type = Sequelize.TEXT;
                break;
            case "date":
                field.type = Sequelize.DATE;
                break;
            case "ref":
                field.type = Sequelize.TEXT;
                break;
            case "refList":
                field.type = Sequelize.JSONB;
                break;
            // case "virtual":
            // field.type = Sequelize.INTEGER;
            // break;
            // case "virtualClient":
            // field.type = Sequelize.INTEGER;
            // break;
            case "password":
                field.type = Sequelize.JSONB;
                break;
            case "object":
                field.type = Sequelize.JSONB;
                break;
            case "objectList":
                field.type = Sequelize.JSONB;
                break;
            // case "virtualRefList":
            // field.type = Sequelize.JSONB;
            // break;
            case "any":
                field.type = Sequelize.JSONB;
                break;
            case "file":
                field.type = Sequelize.JSONB;
                break;
            case "fileList":
                field.type = Sequelize.JSONB;
                break;
            case "uuid":
                field.type = Sequelize.UUID;
                break;
        }

        if (field.type) {
            fields[propName] = field;
        }
    }

    return fields;
};

const getCastingIDType = (storeDesc) => {
    const idProp = storeDesc.props._id;
    switch (idProp.type) {
        case "string":
            return "text";
        case "int":
            return "integer";
        default:
            return "uuid";
    }
};

class DB {
    constructor() {
        if (!process.env.PGDATABASE && !process.env.PGUSER && !process.env.PGPASSWORD && !process.env.PGHOST) {
            console.warn("Connection to PG SQL not configured.");
            this._notConfigured = true;
            return;
        }

        this._tables = {};
        this.waitForConnection = new Promise((resolve) => (this._resolveConnection = resolve));
        this._sequelize = new Sequelize(process.env.PGDATABASE, process.env.PGUSER, process.env.PGPASSWORD, {
            host: process.env.PGHOST,
            port: process.env.PGPORT,
            dialect: "postgres",
            operatorsAliases: {},
            logging,

            pool: {
                max: 5,
                min: 0,
                acquire: 30000,
                idle: 10000,
            },
        });

        console.info("Initializing connection to PG SQL.");
        this._sequelize
            .authenticate()
            .then(() => {
                console.info("Connection to PG SQL has been established successfully.");
                this._resolveConnection();
            })
            .catch((err) => {
                console.error("Unable to connect to the PG SQL database:", err);
            });
    }

    async makeRelations(storeName) {
        const storeDesc = await configStore.getStoreDesc(storeName);
        const table = await this.table(storeDesc.name);
        for (const propName of Object.keys(storeDesc.props)) {
            const propDesc = storeDesc.props[propName];
            if (propDesc.type === "ref") {
                const belongedTable = await this.table(propDesc.store);
                const options = {
                    foreignKey: propName,
                    constraints: false,
                };
                if (propDesc.populateIn?.prop && propDesc.populateIn?.useJoin) {
                    options.as = propDesc.populateIn.prop;
                    if (!table._relations.has(options.as)) {
                        table._relations.add(options.as);
                        const tableName = snakeCase(storeName);
                        const columnName = convertPropName(propName);
                        table.relations.push({
                            table: propDesc.store,
                            model: belongedTable.model,
                            as: options.as,
                            attributes: propDesc.populateIn.populateProps,
                            on: {
                                _id: [
                                    this._sequelize.cast(
                                        this._sequelize.col(`${tableName}.${columnName}`),
                                        getCastingIDType(belongedTable._storeDesc)
                                    ),
                                ],
                            },
                        });
                    }
                }
                table.model.belongsTo(belongedTable.model, options);
            }
        }
    }

    async addTable(storeName) {
        if (!this._tables[storeName]) {
            const tableName = configStore.getMongoCollectionName(storeName);
            let storeDesc;
            const logMatch = tableName.match(/(.*)_log$/);
            const delMatch = tableName.match(/(.*)_deleted$/);
            if (logMatch) {
                const logStoreDesc = await configStore.getStoreDesc(logMatch[1]);
                storeDesc = await getLogStoreDesc(logStoreDesc);
            } else if (delMatch) {
                storeDesc = await configStore.getStoreDesc(delMatch[1]);
            } else {
                storeDesc = await configStore.getStoreDesc(tableName);
            }

            if (!storeDesc) {
                throw new Error("store not found");
            }

            const store = () => {
                const schema = generateSchema(storeDesc);
                let storeDBName = tableName;
                switch (tableName) {
                    case "_sequences":
                    case "_versions":
                        storeDBName = "blank" + tableName;
                        delete schema.__v;
                }

                if (logMatch) {
                    delete schema.__v;
                }

                const options = { freezeTableName: !!delMatch, timestamps: false };
                const model = this._sequelize.define(snakeCase(storeDBName), schema, options);
                return this._sequelize.sync({ force: false, logging }).then(() => new Table(model, storeDesc));
            };

            this._tables[storeName] = store();
            if (!logMatch && !delMatch) {
                await this.makeRelations(storeName);
            }
        }

        return this._tables[storeName];
    }

    begin(options, cb) {
        let autoCallback = cb;
        if (cb) {
            autoCallback = (tx) => {
                const p = Promise.resolve().then(() => {
                    tx.promise = p;
                    return cb(tx);
                });

                return p;
            };
        }

        return this._sequelize.transaction(options, autoCallback);
    }

    query(...args) {
        return this._sequelize.query(...args);
    }

    async table(name) {
        if (this._notConfigured) {
            throw new Error("PG SQL connections is not configured");
        }

        return this.addTable(name);
    }
}

const directAliases = {
    $eq: Op.eq,
    $gt: Op.gt,
    $gte: Op.gte,
    $lt: Op.lt,
    $lte: Op.lte,
    $ne: Op.ne,
    $in: Op.in,
    $nin: Op.notIn,
    $not: Op.not,
    $text: Op.regexp,
    $all: Op.all,

    // PG only options
    $notRegexp: Op.notRegexp,
    $iRegexp: Op.iRegexp,
    $notIRegexp: Op.notIRegexp,
    $like: Op.like,
    $notLike: Op.notLike,
    $iLike: Op.iLike,
    $notILike: Op.notILike,
    $any: Op.any,
    $contains: Op.contains,
    $contained: Op.contained,
    $overlap: Op.overlap,
    $adjacent: Op.adjacent,
    $strictLeft: Op.strictLeft,
    $strictRight: Op.strictRight,
    $noExtendRight: Op.noExtendRight,
    $noExtendLeft: Op.noExtendLeft,
    $between: Op.between,
    $notBetween: Op.notBetween,
};

const mappedAliases = {
    $and: Op.and,
    $or: Op.or,
};

const unimplementedAliases = {
    $where: true,
    $elemMatch: true,
    $size: true,
    $geoWithin: true,
    $geoIntersects: true,
    $near: true,
    $nearSphere: true,
};

const convertMongoQuery = (query) => {
    if (typeof query !== "object" || query == null) {
        return query;
    }
    const q = {};

    for (const key of Object.keys(query)) {
        const directAlias = directAliases[key];
        if (directAlias) {
            if (key === "$contains" && Array.isArray(query[key])) {
                q[directAlias] = query[key].map(convertMongoQuery);
                continue;
            }

            q[directAlias] = query[key];
            continue;
        }

        const mappedAlias = mappedAliases[key];
        if (mappedAlias) {
            q[mappedAlias] = query[key].map(convertMongoQuery);
            continue;
        }

        const unimplementedAlias = unimplementedAliases[key];
        if (unimplementedAlias) {
            console.warn(`Operator ${key} unimplemented yet`);
            continue;
        }

        switch (key) {
            case "$regex":
                if (query["$options"]) {
                    if (query["$options"] === "i") {
                        q[Op.iRegexp] = query[key];
                    } else {
                        console.warn("Only 'i' option supported for $regex operator");
                    }
                } else {
                    q[Op.regexp] = query[key];
                }
                break;
            case "$options":
                // only used with $regex;
                break;

            default:
                q[key] = convertMongoQuery(query[key]);
        }
    }

    return q;
};

class Table {
    constructor(model, storeDesc) {
        this.model = model;
        this._storeDesc = storeDesc;
        this._relations = new Set();
        this.relations = [];
    }

    makeRelationalQuery(where, include) {
        if (!where || typeof where !== "object") {
            return;
        }

        const keys = Reflect.ownKeys(where);
        for (const k of keys) {
            const v = where[k];
            const [table, field] = typeof k !== "symbol" ? k.split(".") : [];

            if (field) {
                delete where[k];
                const relationIndex = include.findIndex((e) => e.table === table);
                if (relationIndex !== -1) {
                    include[relationIndex] = { ...include[relationIndex] };
                    include[relationIndex].where = { [field]: v };
                }
            } else if (v) {
                if (Array.isArray(v)) {
                    v.forEach((e) => {
                        this.makeRelationalQuery(e, include);
                    });
                } else if (typeof v === "object") {
                    this.makeRelationalQuery(v, include);
                }
            }
        }
    }

    async find(request, $user, options = {}) {
        const { tx: transaction, logging } = options;
        const where = convertMongoQuery(request.query || {});
        const q = { where, transaction, logging };
        const { orderBy, take, skip } = request;
        if (orderBy) {
            q.order = [];
            const splitted = orderBy.split(",").map((e) => e.trim());
            for (const orderBy of splitted) {
                if (orderBy.slice(0, 1) === "-") {
                    q.order.push([Sequelize.col(orderBy.slice(1, orderBy.length)), "DESC"]);
                } else {
                    q.order.push(Sequelize.col(orderBy));
                }
            }
        }
        if (take != null) {
            q.limit = take;
        }
        if (skip != null) {
            q.offset = skip;
        }
        if (options.props) {
            const attributes = [...options.props];
            if (!options.props.includes("_id")) {
                attributes.push("_id");
            }
            q.attributes = attributes;
        }

        q.include = [...this.relations];
        this.makeRelationalQuery(q.where, q.include);

        const res = await this.model.findAndCountAll(q);

        return {
            count: res.count,
            items: res.rows || [],
        };
    }

    async get(query, $user, options = {}) {
        const transaction = options.tx;
        if (typeof query === "string") {
            query = { _id: query };
        }
        let attributes;
        if (options.props) {
            attributes = [...options.props];
            if (!options.props.includes("_id")) {
                attributes.push("_id");
            }
        }

        const where = convertMongoQuery(query);

        const include = [...this.relations];
        this.makeRelationalQuery(where, include);

        const res = await this.model.findOne({ where, include, transaction, logging, attributes });
        if (!res || !res.dataValues) {
            throw new Error("Not found");
        }

        return res && res.dataValues;
    }

    async delete(query, $user, options = {}) {
        if (typeof query === "string") {
            query = { _id: query };
        }

        const transaction = options.tx;

        return this.model.destroy({ where: query, transaction, logging });
    }

    async insert($item, $user, options = {}) {
        const transaction = options.tx;
        const res = await this.model.upsert($item, { returning: true, transaction, logging });
        return res[0].dataValues;
    }

    async nextSequence(sequenceId, options = {}) {
        const transaction = options.tx;
        try {
            await this.get(sequenceId, null, options);
            const [affected, res] = await this.model.update(
                { sequence: Sequelize.literal("sequence + 1") },
                {
                    where: { _id: sequenceId },
                    returning: true,
                    transaction,
                    logging,
                }
            );
            if (affected < 1) {
                throw new Error("can't increment sequence");
            }

            return res[0].dataValues.sequence;
        } catch (err) {
            if (err.message === "Not found") {
                const res = await this.model.upsert(
                    { _id: sequenceId, sequence: 1 },
                    { returning: true, transaction, logging }
                );
                return res[0].dataValues.sequence;
            }

            throw err;
        }
    }

    async set(where, $item, $user, options = {}) {
        const transaction = options.tx;
        $item.__v = Sequelize.literal("__v + 1");
        const [affected, res] = await this.model.update($item, {
            where,
            returning: true,
            transaction,
            logging,
        });
        if (affected < 1) {
            return $item;
        }

        return res[0].dataValues;
    }
}

const db = new DB();

module.exports = db;
