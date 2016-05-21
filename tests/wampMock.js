var WampClient = function() {
    this.calls = {};
};

WampClient.prototype.call = function (uri) {
    this.calls[uri] = this.calls[uri] || [];
    this.calls[uri].push({
        "uri": uri,
        "args": Array.prototype.slice.call(arguments, 2)
    });
};

WampClient.prototype.getCallsCount = function (uri) {
    return (this.calls[uri] || []).length;
};

WampClient.prototype.reset = function (uri) {
    this.calls = {};
};

module.exports = WampClient;