var exec = require('child_process').exec;

module.exports = (function () {

    return {
        editor: function (path, editor, callback) {
            exec(editor + ' ' + path, callback);
        },
        browser: function (url, callback) {
            exec('open ' + url, callback);
        }
    };

})();