"use strict";

var assert = require("assert");
var testConfig = require("./config");
var configStore = require("../lib/configStore");
var auth = require("../lib/auth");
configStore.setup(testConfig);

let testUser = {
    _id: 1,
    roles: ["sclif"],
    departments: ["calc", "support", "cal"],
};

let systemUser = {
    _id: "system",
    roles: ["system"],
};

let rootUser = {
    _id: "root",
    roles: ["root"],
};

let allowXYZRule = {
    role: "sclif",
    permissions: "xyz",
};

let allowRule = {
    role: "sclif",
    permissions: "r",
    condition: {
        allowedDepartments: {
            $in: {
                $expression: "$user.departments",
            },
        },
        prop: 3,
    },
};

let denyRule = {
    role: "sclif",
    permissions: "c-rud",
};

let denySystem = {
    role: "system",
    permissions: "-r",
};

let denyRuleWithCondition = {
    role: "sclif",
    permissions: "c-rud",
    condition: {
        deniedDepartments: {
            $in: {
                $expression: "$user.departments",
            },
        },
    },
};

describe("auth", function() {
    describe("#computeAccess", function() {
        it("should grant permissions only from 'permissions' argument", function() {
            let access = auth.computeAccess([allowXYZRule], testUser, "y");
            assert.equal(access, "y");
        });
        it("should not grant deny permission ('-') if it found at least one time", function() {
            let access = auth.computeAccess([allowRule, denyRule], testUser, "r");
            assert.equal(access, "");
        });
        it("should process deny ('-') permissions only without conditions", function() {
            let access = auth.computeAccess([allowRule, denyRuleWithCondition], testUser, "r");
            assert.equal(access, "r");
        });
        it("should always grant permissions for 'system' role", function() {
            let access = auth.computeAccess([denySystem], systemUser, "r");
            assert.equal(access, "r");
        });
        it("should grant permissions for 'root' role if it not provided in rules", function() {
            let access = auth.computeAccess([denyRule], rootUser, "r");
            assert.equal(access, "r");
        });
    });
    describe("#computeMongoQuery", () => {
        it("should replace $expression with expression result", async () => {
            const query = await auth.computeMongoQuery([allowRule], testUser);
            assert.deepEqual(query, {
                allowedDepartments: {
                    $in: ["calc", "support", "cal"],
                },
                prop: 3,
            });
        });
        it("should append owner check for singleView store", async () => {
            const rule = { role: "sclif", permissions: "r", condition: { prop: 3 } };
            const query = await auth.computeMongoQuery([rule], testUser, true);
            assert.deepEqual(query, {
                $and: [{ prop: 3 }, { _ownerId: 1 }],
            });
        });
        it("should include -r rules with $not operator", async () => {
            const query = await auth.computeMongoQuery([allowRule, denyRuleWithCondition], testUser);
            assert.deepEqual(query, {
                $and: [
                    {
                        allowedDepartments: {
                            $in: ["calc", "support", "cal"],
                        },
                        prop: 3,
                    },
                    {
                        $not: {
                            deniedDepartments: {
                                $in: ["calc", "support", "cal"],
                            },
                        },
                    },
                ],
            });
        });
    });
});
