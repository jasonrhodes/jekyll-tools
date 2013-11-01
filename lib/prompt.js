module.exports = function (message, callback) {
    console.log(message);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', function (text) {
        var output = text.trim();
        if (/^quit/.test(output) || /^exit/.test(output)) {
            process.exit();
        }
        callback(output);
    });
};