const reg = new RegExp("\s*-?\s*[a-z]\s*", "g");
const denyReadReg = new RegExp("-\s*r");

class Auth {
    computeAccess(rules, user, permissions) {
        rules = (Array.isArray(rules) && rules.length > 0) ? rules : [
            { "role": "root", "permissions": permissions || "crud" },
            { "role": "all", "permissions": permissions || "crud" },
        ];
        for (let i = rules.length - 1; i >= 0; i--) {
            let rule = rules[i];
            if (rule.role === "system") {
                rules.splice(i, 1);
            }
        }
        rules.push({ "role": "system", "permissions": permissions || "crud" });
        this.__prepareUser(user);

        let canGrant = permissions || "crud", res = "";
        for (let rule of rules) {
            if (user.roles.indexOf(rule.role) >= 0) {
                let permissions = rule.permissions.match(reg) || [];
                for (let p of permissions) {
                    p = p.trim();
                    if (p[0] === "-") {
                        if (rule.condition == null) {
                            canGrant = canGrant.replace(p[1], "");
                            res = res.replace(p[1], "");
                        }
                    } else if (canGrant.indexOf(p) >= 0 && res.indexOf(p) < 0) {
                        res += p;
                    }
                }
            }
        }
        return res;
    }

    hasCreateAccess(rules, user) {
        return this.computeAccess(rules, user, "c") === "c";
    }

    hasReadAccess(rules, user) {
        return this.computeAccess(rules, user, "r") === "r";
    }

    hasUpdateAccess(rules, user) {
        return this.computeAccess(rules, user, "u") === "u";
    }

    hasDeleteAccess(rules, user) {
        return this.computeAccess(rules, user, "d") === "d";
    }


    computeMongoQuery(rules, user) {
        if (rules == null) {
            return null;
        }
        this.__prepareUser();
        let readRulesWithCondition = rules.filter(rule =>
            user.roles.indexOf(rule.role) >= 0 &&
            rule.permissions.indexOf("r") >= 0 &&
            rule.condition != null
        );
        let allowRead = readRulesWithCondition.filter(rule =>
            !rule.permissions.match(denyReadReg)
        ).map(r => this.__computeExpressions(r.condition, user));
        let denyRead = readRulesWithCondition.filter(rule =>
            rule.permissions.match(denyReadReg)
        ).map(r => this.__computeExpressions(r.condition, user));
        let allow;
        switch (allowRead.length) {
            case 0:
                return null;
            case 1:
                allow = allowRead[0];
                break;
            default: {
                let res = { "$or": [] };
                for (let r of allowRead) {
                    res.$or.push(r);
                }
                allow = res;
            }
        }
        switch (denyRead.length) {
            case 0:
                return allow;
            case 1:
                return { "$and": [allow, { "$not": denyRead[0] }] };
            default: {
                let deny = { "$or": [] };
                for (let r of denyRead) {
                    deny.$or.push(r);
                }
                return { "$and": [allow, { "$not": deny }] };
            }
        }
    }

    __computeExpressions(condition, user) {
        if (typeof condition !== "object") {
            return condition;
        }
        if (Array.isArray(condition)) {
            let res = [];
            for (let e of condition) {
                res.push(this.__computeExpressions(e, user));
            }
            return res;
        }
        let res = {};
        for (let propName of Object.keys(condition)) {
            let prop = condition[propName];
            if (typeof prop === "object" && prop.hasOwnProperty("$expression")) {
                if (typeof prop.$expression === "string") {
                    prop.$expression = new Function("$user", `$user = $user || {}; return ${prop.$expression};`);
                }
                res[propName] = prop.$expression(user);
            } else {
                res[propName] = this.__computeExpressions(prop, user);
            }
        }
        return res;
    }

    __prepareUser(user) {
        user = user || {};
        if (!Array.isArray(user.roles)) {
            user.roles = [];
        }
        if (user.roles.indexOf("guest") < 0 && user.roles.indexOf("all") < 0) {
            user.roles.push("all");
        }
    }
}

let auth = new Auth();

export default auth;
module.exports = auth;