"use strict";

var request = require("request"),
    stream = require("stream"),
    querystring = require("querystring");


var TypeList = ["UInt8", "UInt16", "UInt32", "UInt64", "Int8", "Int16", "Int32", "Int64"];

class TypeCast {
    constructor() {
        this.castMap = TypeList.reduce(
            (obj, type) => {
                obj[type] = value => { return parseInt(value, 10) };
                return obj;
            },
            {
                "Date": value => value,
                "String": value => value,
            }
        );
    }


    cast(type, value) {
        return this.castMap[type] ? this.castMap[type](value) : value;
    }
}


class ClickHouse {
    constructor(_opts) {
        this.opts = Object.assign(
            {
                url: "http://localhost",
                port: 8123,
                debug: false,
            },
            _opts
        );

        this.typeCast = new TypeCast();
    }

    getHost() {
        return this.opts.url + ":" + this.opts.port;
    }

	/**
	 * Get url query
	 * @param {String} query
	 * @returns {String}
	 */
    getUrl(query) {
        var params = {};

        if (query) params["query"] = query + " FORMAT TabSeparatedWithNamesAndTypes";

        if (Object.keys(params).length == 0) return new Error("query is empty");

        return this.getHost() + "?" + querystring.stringify(params);
    }


	/**
	 * Parse data
	 * @param {Buffer} data
	 * @returns {Array}
	 */
    _parseData(data) {
        var rows = data.toString("utf8").split("\n");
        if (rows.length < 2) {
            return data;
        }
        let columnList = rows[0].split("\t"),
            typeList = rows[1].split("\t");

        // Удаляем строки с заголовками и типами столбцов И завершающую строку
        rows = rows.slice(2, rows.length - 1);

        columnList = columnList.reduce(
            function (arr, column, i) {
                arr.push({
                    name: column,
                    type: typeList[i],
                });

                return arr;
            },
            []
        );

        return rows.map((row, i) => {
            let columns = row.split("\t");

            return columnList.reduce((obj, column, i) => {
                obj[column.name] = this.typeCast.cast(column.type, columns[i]);
                return obj;
            }, {});
        });
    }


	/**
	 * Exec query
	 * @param {String} query
	 * @param {Function} cb
	 * @returns {Stream|undefined}
	 */
    query(query, post, cb) {
        if (typeof post === "function") {
            cb = post;
            post = false;
        }
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
        var url = this.getUrl(query);

        if (this.opts.debug) console.log("url", url);

        request(
            {
                "url": url,
                "method": (post ? "POST" : "GET"),
            },
            (error, response, body) => {
                if (!error && response.statusCode == 200) {
                    console.log("[ClickHouse] QUERY completed");
                    return cb(null, this._parseData(body));
                }
                console.error("[ClickHouse] QUERY error:", response.body);
                cb(error || response.statusCode);
            });

        return d;
    }


	/**
	 * Insert rows by one query
	 * @param {String} tableName
	 * @param {Array} values List or values. Each value is array of columns
	 * @param {Function} cb
	 * @returns
	 */
    insertMany(tableName, values, cb) {
        var url = `INSERT INTO ${tableName} FORMAT TabSeparated`;

        request.post(
            {
                url: this.getHost() + "?query=" + url,
                body: values
                    .map(i => i.join("\t"))
                    .join("\n"),
                headers: {
                    "Content-Type": "text/plain",
                },
            },
            (error, response, body) => {
                if (!error && response.statusCode == 200) {
                    return cb(null, body);
                }
                return cb(error || body);
            }
        );
    }

    insert(tableName, values, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        var url = `INSERT INTO ${tableName} FORMAT TabSeparated`;
        if (!Array.isArray(values)) {
            values = [values];
        }
        values = values.map(v => {
            let props = [];
            for (let key of Object.keys(v)) {
                props.push(v[key]);
            }
            return props.join("\t");
        }).join("\n");

        request.post(
            {
                url: this.getHost() + "?query=" + url,
                body: values,
                headers: { "Content-Type": "text/plain" },
            },
            (error, response, body) => {
                if (!error && response.statusCode == 200) {
                    console.log("[ClickHouse] INSERT completed");
                    return cb(null, body);
                }
                console.error("[ClickHouse] INSERT error:", error, body);
                return cb(error || body);
            }
        );

        return d;
    }
}


module.exports = ClickHouse;