let configStore = require("./configStore");
let find = require("utils/find");

module.exports.get = function (key, locale) {
    let args = Array.prototype.slice.call(arguments, locale ? 2 : 1);
    locale = locale || configStore.getLocale();
    let i18n = configStore.getI18n(locale);
    let res = find.property(i18n, key);
    if (!res) {
        return "";
    }
    if (args.length > 0) {
        let i = 0;
        res = res.replace(/%s/g, () => args[i++]);
    }
    return res;
};