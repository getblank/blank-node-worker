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
        if (propName == "_id") {
            field.primaryKey = true;
        }

        switch (propDesc.type) {
            case "int":
                field.type = Sequelize.INTEGER;
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

const convertMongoQuery = query => {
    if (typeof query != "object") {
        return query;
    }
    const q = {};

    for (const key of Object.keys(query)) {
        switch (key) {
            case "$eq":
                q[Op.eq] = query[key];
                break;
            case "$gt":
                q[Op.gt] = query[key];
                break;
            case "$gte":
                q[Op.gte] = query[key];
                break;
            case "$lt":
                q[Op.lt] = query[key];
                break;
            case "$lte":
                q[Op.lte] = query[key];
                break;
            case "$ne":
                q[Op.ne] = query[key];
                break;
            case "$in":
                q[Op.in] = query[key];
                break;
            case "$nin":
                q[Op.nin] = query[key];
                break;
            case "$or":
                q[Op.or] = query[key].map(convertMongoQuery);
                break;
            case "$and":
                q[Op.and] = query[key].map(convertMongoQuery);
                break;
            case "$not":
                q[Op.not] = query[key];
                break;
            case "$nor":
                // not implemented yet
                // q[Op.eq] = query[key];
                break;
            case "$exist":
                // no sense
                // q[Op.eq] = query[key];
                break;
            case "$type":
                // no sense
                // q[Op.eq] = query[key];
                break;
            case "$mod":
                // not implemented yet
                // q[Op.eq] = query[key];
                break;
            case "$regex":
                q[Op.eq] = query[key];
                break;
            case "$text":
                q[Op.regex] = query[key];
                break;
            case "$where":
                // not implemented yet
                // q[Op.regex] = query[key];
                break;
            case "$all":
                q[Op.all] = query[key];
                break;
            case "$elemMatch":
                // not implemented yet
                // q[Op.eq] = query[key];
                break;
            case "$size":
                // not implemented yet
                // q[Op.eq] = query[key];
                break;
            case "$geoWithin":
                // not implemented yet
                // q[Op.eq] = query[key];
                break;
            case "$geoIntersects":
                // not implemented yet
                // q[Op.eq] = query[key];
                break;
            case "$near":
                // not implemented yet
                // q[Op.eq] = query[key];
                break;
            case "$nearSphere":
                // not implemented yet
                // q[Op.eq] = query[key];
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
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({ [Op.or]: [{ _deleted: false }, { _deleted: null }] });
        const q = { where, transaction };
        const { orderBy, take, skip } = request;
        if (orderBy) {
            q.order = Sequelize.col(orderBy);
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
