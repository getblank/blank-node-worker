const snakeCase = require("lodash/snakeCase");
const Sequelize = require("sequelize");
const configStore = require("../configStore");

const { Op } = Sequelize;

const generateSchema = storeDesc => {
    const fields = { __v: { type: Sequelize.INTEGER } };
    for (const propName of Object.keys(storeDesc.props)) {
        const propDesc = storeDesc.props[propName];
        const fieldName = (/^_[a-zA-Z]/.test(propName) ? "_" : "") + snakeCase(propName);
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

class DB {
    constructor() {
        if (!process.env.PGDATABASE && !process.env.PGUSER && !process.env.PGPASSWORD && !process.env.PGHOST) {
            console.warn("Connection to PG SQL not configured.");
            this._notConfigured = true;
            return;
        }

        this._tables = {};
        this.waitForConnection = new Promise(resolve => (this._resolveConnection = resolve));
        this._sequelize = new Sequelize(process.env.PGDATABASE, process.env.PGUSER, process.env.PGPASSWORD, {
            host: process.env.PGHOST,
            dialect: "postgres",
            operatorsAliases: false,
            logging: () => {},

            pool: {
                max: 5,
                min: 0,
                acquire: 30000,
                idle: 10000,
            },
        });

        console.info("Initialising connection to PG SQL.");
        this._sequelize
            .authenticate()
            .then(() => {
                console.info("Connection to PG SQL has been established successfully.");
                this._resolveConnection();
            })
            .catch(err => {
                console.error("Unable to connect to the PG SQL database:", err);
            });
    }

    async add(storeName) {
        if (!this._tables[storeName]) {
            const delMatch = storeName.match(/(.*)_deleted$/);
            let storeDesc;
            if (delMatch) {
                storeDesc = await configStore.getStoreDesc(delMatch[1]);
            } else {
                storeDesc = await configStore.getStoreDesc(storeName);
            }

            if (!storeDesc) {
                throw new Error("store not found");
            }

            const store = () => {
                const schema = generateSchema(storeDesc);
                if (storeName === "_sequences") {
                    delete schema.__v;
                }

                const options = { freezeTableName: !!delMatch };
                const model = this._sequelize.define(snakeCase(storeName), schema, options);
                return this._sequelize.sync({ force: false, logging: () => {} }).then(() => new Table(model));
            };

            this._tables[storeName] = store();
        }

        return this._tables[storeName];
    }

    begin(options, cb) {
        return this._sequelize.transaction(options, cb);
    }

    async table(name) {
        if (this._notConfigured) {
            throw new Error("PG SQL connections is not configured");
        }

        return this.add(name);
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
    $nin: Op.nin,
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

const convertMongoQuery = query => {
    if (typeof query != "object" || query == null) {
        return query;
    }
    const q = {};

    for (const key of Object.keys(query)) {
        const directAlias = directAliases[key];
        if (directAlias) {
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
    constructor(model) {
        this.model = model;
    }

    async find(request, $user, options = {}) {
        const transaction = options.tx;
        const where = convertMongoQuery(request.query || {});
        const q = { where, transaction };
        const { orderBy, take, skip } = request;
        if (orderBy) {
            q.order = [];
            const splitted = orderBy.split(",").map(e => e.trim());
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

        const where = convertMongoQuery(query);
        const res = await this.model.findOne({ where, transaction, logging: () => {} });
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

        return this.model.destroy({ where: query, transaction, logging: () => {} });
    }

    async insert($item, $user, options = {}) {
        const transaction = options.tx;
        const res = await this.model.upsert($item, { returning: true, transaction, logging: () => {} });
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
                    logging: () => {},
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
                    { returning: true, transaction, logging: () => {} }
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
            logging: () => {},
        });
        if (affected < 1) {
            return $item;
        }

        return res[0];
    }
}

const db = new DB();

module.exports = db;