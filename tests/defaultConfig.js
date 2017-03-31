let props = {
    _id: {
        type: "string",
        required: true,
        display: "none",
        readOnly: true,
        configurable: true,
    },
    name: {
        type: "string",
        display: "headerInput",
        configurable: true,
    },
    _deleted: {
        type: "bool",
        display: "none",
        configurable: false,
    },
    _ownerId: {
        type: "ref",
        store: "users",
        display: "none",
        required: true,
        configurable: true,
    },
    createdBy: {
        type: "ref",
        store: "users",
        display: "none",
        configurable: false,
    },
    updatedBy: {
        type: "ref",
        store: "users",
        display: "none",
        configurable: false,
    },
    deletedBy: {
        type: "ref",
        store: "users",
        display: "none",
        configurable: false,
    },
    createdAt: {
        type: "date",
        display: "none",
        configurable: true,
    },
    updatedAt: {
        type: "date",
        display: "none",
        configurable: false,
    },
    deletedAt: {
        type: "date",
        display: "none",
        configurable: false,
    },
    event: {
        type: "string",
        display: "none",
    },
    level: {
        type: "string",
        display: "none",
    },
    message: {
        type: "string",
        display: "none",
    },
    details: {
        type: "string",
        display: "none",
    },
    ttl: {
        type: "int",
        display: "none",
        min: 0,
    },
    relatedObjects: {
        type: "objectList",
        display: "none",
        props: {
            _id: {
                type: "string",
                display: "none",
            },
            name: {
                type: "string",
                display: "none",
            },
            mode: {
                type: "string",
                display: "none",
            },
            store: {
                type: "string",
                display: "none",
            },
        },
    },
};

function _mergeProps(newProps) {
    Object.assign(newProps, props);
    return newProps;
}

exports.props = props;
exports.mergeProps = _mergeProps;