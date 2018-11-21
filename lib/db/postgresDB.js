const snakeCase = require("lodash/snakeCase");
const Sequelize = require("sequelize");
const configStore = require("../configStore");

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
        this._tables = {};
        this._sequelize = new Sequelize(process.env.PGDATABASE, process.env.PGUSER, process.env.PGPASSWORD, {
            host: process.env.PGHOST,
            dialect: "postgres",
            operatorsAliases: false,
            // logging: console.debug,

            pool: {
                max: 5,
                min: 0,
                acquire: 30000,
                idle: 10000,
            },
        });

        this._waitForConnection = new Promise(f => {
            this._resolveConnection = f;
        });

        this._sequelize
            .authenticate()
            .then(() => {
                this._resolveConnection();
                console.log("Connection to PG SQL has been established successfully.");
            })
            .catch(err => {
                console.error("Unable to connect to the PG SQL database:", err);
            });
    }

    async add(storeName) {
        if (!this._tables[storeName]) {
            const storeDesc = await configStore.getStoreDesc(storeName);
            if (!storeDesc) {
                throw new Error("store not found");
            }

            const store = () => {
                const schema = generateSchema(storeDesc);
                const model = this._sequelize.define(snakeCase(storeName), schema);
                return this._sequelize.sync({ force: false, logging: () => {} }).then(() => new Table(model));
            };

            this._tables[storeName] = store();
        }

        return this._tables[storeName];
    }

    async table(name) {
        return this.add(name);
    }
}

class Table {
    constructor(model) {
        this.model = model;
    }

    async find(request, $user, options) {
        const q = {};
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

    async get(query, $user, options) {
        if (typeof query === "string") {
            query = { _id: query };
        }

        const { _id } = query;
        const res = await this.model.findOne({ where: { _id } });

        return res && res.dataValues;
    }

    async delete(query, $user, options) {
        console.info("DELETE QUERY", query);
    }

    async insert($item, $user, options) {
        const res = await this.model.upsert($item, { returning: true, logging: () => {} });
        return res[0].dataValues;
    }

    async set(where, $item, $user, options) {
        $item.__v = Sequelize.literal("__v + 1");
        const [affected, res] = await this.model.update($item, { where, returning: true, logging: () => {} });
        if (affected < 1) {
            return $item;
        }

        return res[0];
    }
}

const db = new DB();

module.exports = db;
