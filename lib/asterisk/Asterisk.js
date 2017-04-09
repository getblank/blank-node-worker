const PROTO_PATH = __dirname + "/../proto/proxy.proto";

const grpc = require("grpc");
const EventEmitter = new require("events").EventEmitter;

console.debug = console.debug || console.log;
let client;
try {
    client = grpc.load(__dirname + "/proxy.proto").proxy;
} catch (err) {
    client = grpc.load(PROTO_PATH).proxy;
}

const pause = async (timeout) => {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
};

const agentRgx = /^(PJSIP\/|SIP\/|IAX2\/|Local\/)[0-9]+/;

let bac;

class Asterisk extends EventEmitter {
    /**
     * blankAstersikClient constructor
     *
     * @param {string} address - address with port to connect
     *
     * @returns new BAC or existing BAC if already was called
     */
    constructor(address) {
        if (bac) {
            return bac;
        }

        if (!address) {
            throw new Error("Address missing");
        }

        super();
        this._address = address;
        this._client = new client.Proxy(this._address, grpc.credentials.createInsecure());
        this._pinger();
        this._eventsReceiver();
        bac = this;
    }

    /**
     * make action
     *
     * @param {Object} data — data to pass to Asterisk
     *
     * @returns {Promise}
     */
    action(data) {
        return new Promise((resolve, reject) => {
            if (!this.connected()) {
                return reject(new Error("not connected"));
            }

            this._client.action({ data }, (err, res) => {
                if (err) {
                    return reject(err.data || err);
                }

                resolve(res.data);
            });
        });
    }

    /**
     * Refresh list of agents. Agents statuses will follow
     */
    agentList() {
        return new Promise((resolve, reject) => {
            if (!this.connected()) {
                return reject(new Error("not connected"));
            }

            this._client.action({ action: "AgentsList" }, (err, res) => {
                if (err) {
                    return reject(err.data || err);
                }

                resolve(res.data);
            });
        });
    }

    /**
     * connection checker
     *
     * @returns {boolean} — true for connected and false when not connected
     */
    connected() {
        return this._client.$channel.getConnectivityState() === 2;
    }

    /**
     * Add agent to queue
     *
     * @param {string} agent — agent name or interface
     * @param {string} queue — queue name
     *
     * @returns {Promise}
     */
    queueAdd(agent, queue) {
        if (!agentRgx.test(agent)) {
            agent = `SIP/${agent}`;
        }

        return this.action({ action: "QueueAdd", queue: queue, interface: agent });
    }

    /**
     * Pause agent
     *
     * @param {string} agent — agent name or interface
     * @param {string} reason — pause reason
     * @param {string=} queue — queue name, if missed, pause status will change in all queues
     *
     * @returns {Promise}
     */
    queuePause(agent, reason, queue) {
        if (!agentRgx.test(agent)) {
            agent = `SIP/${agent}`;
        }

        if (queue) {
            return this.action({ action: "QueuePause", paused: "1", queue: queue, interface: agent, reason: reason || "" });
        }

        return this.action({ action: "QueuePause", paused: "1", interface: agent, reason: reason || "" });
    }

    /**
     * Getting queue status
     *
     * @param {string} queue — queue name
     *
     * @returns {Promise}
     */
    queueStatus(queue) {
        return new Promise((resolve, reject) => {
            this._client.queueStatus({ data: queue }, (err, res) => {
                if (err) {
                    return reject(err);
                }

                for (let k of Object.keys(res)) {
                    if (k === "name") {
                        continue;
                    }

                    res[k] = parseInt(res[k], 10);
                }

                resolve(res);
            });
        });
    }

    /**
     * UnPause agent
     *
     * @param {string} agent — agent name or interface
     * @param {string} reason — pause reason
     * @param {string=} queue — queue name, if missed, pause status will change in all queues
     *
     * @returns {Promise}
     */
    queueUnPause(agent, reason, queue) {
        if (!agentRgx.test(agent)) {
            agent = `SIP/${agent}`;
        }

        if (queue) {
            return this.action({ action: "QueuePause", paused: "0", queue: queue, interface: agent, reason: reason || "" });
        }

        return this.action({ action: "QueuePause", paused: "0", interface: agent, reason: reason || "" });
    }

    /**
     * Remove agent from queue
     *
     * @param {string} agent — agent name or interface
     * @param {string} queue — queue name
     *
     * @returns {Promise}
     */
    queueRemove(agent, queue) {
        if (!agentRgx.test(agent)) {
            agent = `SIP/${agent}`;
        }

        return this.action({ action: "QueueRemove", queue: queue, interface: agent });
    }

    /**
     * Refresh statuses of the queues. Statuses will follow
     */
    requestQueueStatus() {
        return new Promise((resolve, reject) => {
            if (!this.connected()) {
                return reject(new Error("not connected"));
            }

            this._client.action({ action: "QueueStatus" }, (err, res) => {
                if (err) {
                    return reject(err.data || err);
                }

                resolve(res.data);
            });
        });
    }

    _eventsReceiver() {
        const stream = this._client.amiStream({});
        stream.on("data", ({ data }) => {
            this.emit("event", data);

            if (data.Uniqueid) {
                this.emit(data.Uniqueid, data);
            }

            if (data.UUID) {
                this.emit(data.UUID, data);
            }

            if (data.Event) {
                this.emit(data.Event, data);
            }
        });

        stream.on("end", () => {
            console.info("[eventsReceiver] AMI events receiving ends");
            this._eventsReceiver();
        });

        stream.on("error", err => {
            console.info("[eventsReceiver] AMI events receiving error", err);
            this._eventsReceiver();
        });
    }

    _ping(num) {
        return new Promise((resolve, reject) => {
            if (!this.connected()) {
                return reject(new Error("not connected"));
            }

            setTimeout(() => reject(new Error("timeout 2s reached")), 2000);
            this._client.ping({ num }, (err, res) => {
                if (err) {
                    return reject(err);
                }

                resolve(parseInt(res.num));
            });
        });
    }

    _pinger() {
        const fn = async () => {
            let connected = false;
            for (let i = 0; i >= 0; i++) {
                try {
                    const res = await this._ping(i);
                    if (res !== i) {
                        throw new Error(`ping num mismatch, expected ${i}, got ${res}`);
                    }

                    if (i % 60 === 0 || !connected) {
                        // show ping every minute
                        console.debug(`[pinger] pinged num: ${i}`);
                    }
                    connected = true;
                } catch (err) {
                    if (connected || i % 5 === 0) {
                        console.error(`[pinger] ping ${i} error`, err);
                    }

                    connected = false;
                } finally {
                    await pause(1000);
                }
            }
        };

        fn();
    }
}

module.exports = Asterisk;