let configStore  = require("./configStore");
let find = require("utils/find");

module.exports.get = function(key, locale) {
    locale = locale || configStore.getLocale();
    let i18n = configStore.getI18n(locale);
    return find.property(i18n, key);
};