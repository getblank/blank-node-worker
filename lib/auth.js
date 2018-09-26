const reg = new RegExp("s*-?s*[a-z]s*", "g");
const denyReadReg = new RegExp("-s*r");

function getRule(role, permissions) {
    return { role: role, permissions: permissions || "vcrudx" };
}

class Auth {
    async computeAccess(rules, user, permissions) {
        rules = Array.isArray(rules) && rules.length > 0 ? rules : [getRule("all")];
        let pushRoot = true;
        for (let i = rules.length - 1; i >= 0; i--) {
            let rule = rules[i];
            if (rule.role === "system") {
                rules.splice(i, 1);
            }
            if (rule.role === "root") {
                pushRoot = false;
            }
        }

        rules.push(getRule("system"));
        if (pushRoot) {
            rules.push(getRule("root"));
        }

        this.__prepareUser(user);
        let canGrant = permissions || "vcrudx";
        let res = "";
        for (const rule of rules) {
            if (user.roles.indexOf(rule.role) >= 0) {
                const permissions = rule.permissions.match(reg) || [];
                for (let p of permissions) {
                    p = p.trim();
                    if (p[0] === "-") {
                        if (rule.condition == null) {
                            canGrant = canGrant.replace(p[1], "");
                            res = res.replace(p[1], "");
                        }

                        continue;
                    }

                    if (canGrant.indexOf(p) >= 0 && res.indexOf(p) < 0) {
                        res += p;
                    }
                }
            }
        }

        return res;
    }

    async hasCreateAccess(rules, user) {
        return (await this.computeAccess(rules, user, "c")) === "c";
    }

    async hasDeleteAccess(rules, user) {
        return (await this.computeAccess(rules, user, "d")) === "d";
    }

    async hasExecuteAccess(rules, user) {
        return (await this.computeAccess(rules, user, "x")) === "x";
    }

    async hasReadAccess(rules, user) {
        return (await this.computeAccess(rules, user, "r")) === "r";
    }

    async hasUpdateAccess(rules, user) {
        return (await this.computeAccess(rules, user, "u")) === "u";
    }

    async computeMongoQuery(rules, user, appendOwnerCheck) {
        if (rules == null) {
            return null;
        }

        this.__prepareUser();
        const readRulesWithCondition = [];
        for (const rule of rules) {
            if (user.roles.indexOf(rule.role) >= 0 && rule.permissions.indexOf("r") >= 0) {
                if (rule.condition == null) {
                    readRulesWithCondition.length = 0;
                    break;
                }
                readRulesWithCondition.push(rule);
            }
        }

        const allowRead = await Promise.all(
            readRulesWithCondition
                .filter(rule => !rule.permissions.match(denyReadReg))
                .map(async r => this.__computeExpressions(r.condition, user))
        );
        const denyRead = await Promise.all(
            readRulesWithCondition
                .filter(rule => rule.permissions.match(denyReadReg))
                .map(async r => this.__computeExpressions(r.condition, user))
        );

        let query = null;
        switch (allowRead.length) {
            case 0:
                break;
            case 1:
                query = allowRead[0];
                break;
            default: {
                const res = { $or: [] };
                for (const r of allowRead) {
                    res.$or.push(r);
                }
                query = res;
            }
        }

        switch (denyRead.length) {
            case 0:
                break;
            case 1:
                query = query ? { $and: [query, { $not: denyRead[0] }] } : { $not: denyRead[0] };
                break;
            default: {
                const deny = { $or: [] };
                for (const r of denyRead) {
                    deny.$or.push(r);
                }
                query = query ? { $and: [query, { $not: deny }] } : { $not: deny };
                break;
            }
        }

        if (appendOwnerCheck) {
            if (query && Array.isArray(query.$and)) {
                query.$and.push({ _ownerId: user._id });
            } else {
                query = query ? { $and: [query, { _ownerId: user._id }] } : { _ownerId: user._id };
            }
        }

        return query;
    }

    async __computeExpressions(condition, user) {
        if (typeof condition !== "object") {
            return condition;
        }

        if (Array.isArray(condition)) {
            const res = [];
            for (const e of condition) {
                res.push(await this.__computeExpressions(e, user));
            }

            return res;
        }

        const res = {};
        for (const propName of Object.keys(condition)) {
            const prop = condition[propName];
            if (typeof prop === "object" && prop.hasOwnProperty("$expression")) {
                if (typeof prop.$expression === "string") {
                    prop.$expression = new Function("$user", `$user = $user || {}; return ${prop.$expression};`);
                }
                res[propName] = await prop.$expression(user);
            } else {
                res[propName] = await this.__computeExpressions(prop, user);
            }
        }

        return res;
    }

    __prepareUser(user) {
        user = user || {};
        if (user._id === "guest") {
            user.roles = ["guest"];
            return;
        }

        if (!Array.isArray(user.roles)) {
            user.roles = [];
        }

        if (user.roles.indexOf("guest") < 0 && user.roles.indexOf("all") < 0) {
            user.roles.push("all");
        }
    }
}

let auth = new Auth();

module.exports = auth;
