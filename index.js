var exec    = require('child_process').exec
  , spawn   = require('child_process').spawn
  , async   = require('async')
  , color   = require('cli-color')
  , fs      = require('fs')
  , open    = require('./lib/opener')
  , yaml    = require('js-yaml')
  , config  = require(process.cwd() + '/_config.yml')
  , _       = require('lodash')
  ;

module.exports = (function () {

    var defaults = {
        up: {
            editorCommand: 'vi',
            port: 4000
        },
        new: {
            type: "post"
        }
    };

    var setJekyllFlags = function (options, flags) {
        flags = flags || [];
        options.watch && flags.push('--watch');
        options.drafts && flags.push('--drafts');
        options.future && flags.push('--future');
        options.port && flags.push('--port=' + options.port);

        return flags;
    };

    var getOptions = function (set, options) {
        return _.extend(defaults[set], config, options);
    };

    return {
        // Gets up the jekyll server based on the cwd
        up: function (options) {
                        
            var serving, flags = ['serve'];
            options = getOptions('up', options);
            flags = setJekyllFlags(options, flags);
            serving = spawn('jekyll', flags);

            serving.stdout.on('data', function (data) {
                console.log(color.blue(data.toString()));
            });

            serving.stderr.on('data', function (data) {
                var line = data.toString();
                var started = /WEBrick\:\:HTTPServer\#start/.test(line);

                console.log(color.yellow(line));

                if (options.browser && started) {
                    open.browser('http://localhost:' + options.port);
                }

                if (options.editor && started) {
                    open.editor(process.cwd(), options.editor);
                }

            });
        },
        // Kills the specified Jekyll process, or if none specified, all
        down: function (pid) {
            if (pid) {
                exec('kill ' + pid, function (err, stdout, stderr) {
                    if (err) {
                        console.log(color.red(err.toString()));
                    } else {
                        console.log(color.green('Found and killed pid ' + pid));
                    }
                });
            } else {
                exec("ps -A | grep -i jekyll | grep -v grep | awk '{print $1}'", function (err, stdout, stderr) {
                    var pids = stdout.split("\n").filter(function (el) { return el; });
                    
                    pids.forEach(function (pid, i) {
                        pid && exec('kill ' + pid);
                    });
                    console.log(color.green('Found and killed ' + pids.length + ' jekyll processes: [' + pids.join(", ") + ']'));
                });
            }
        },
        new: function (options) {
            var directory, frontMatter, content;

            options = _.extend(defaults['new'], options);
            options.layout = options.layout || options.type;
            
            // Directory is always passed relative to project root
            directory = process.cwd() + "/";
            directory += options.directory || (options.draft && "_drafts") || "_" + options.type + "s";
            delete options.directory;
            delete options.draft;

            content = options.content;
            delete options.content;

            frontMatter = ["---"];
            _.forOwn(options, function (i, key) {
                var line = key + ": ";
                if (_.isArray(options[key])) {
                    line += "[" + options[key].join(", ") + "]";
                } else {
                    line += options[key];
                }
                frontMatter.push(line);
            });
            frontMatter.push("---");

            exec('mkdir -p ' + directory, function (err, stdout, stderr) {
                if (err) {
                    console.log(color.red(err));
                    return;
                }
                exec('echo "' + frontMatter.join('\n') + '\n' + content + '" > ' + directory + '/' + options.slug, function (err, stdout, stderr) {
                    if (err) {
                        console.log(color.red(err));
                    }
                });
            });

            
        },
        find: function (options, callback) {
            var directory = process.cwd() + "/" + (options.directory || "_" + options.type + "s");
            var jekyll = this;
            fs.readdir(directory, function (err, files) {

                if (options.search) {
                    files = files.filter(function (f) {
                        var regex = new RegExp(options.search);
                        return regex.test(f);
                    });
                }

                if (options.search && files.length === 1) {
                    console.log(color.green("Found one file matching '" + options.search + "', opening now..."));
                    jekyll.edit(directory + '/' + _.take(files));
                    return;
                }

                if (options.search && files.length < 1) {
                    console.log(color.red("Found 0 files matching '" + options.search + "', please try again."));
                    return;
                }

                callback(files);
            });

        },
        edit: function (path, editor) {
            editor = editor || config.editor || 'vi';
            open.editor(path, editor, function (err, stdout, stderr) {
                if (err) { console.log(color.red(err)); return; }
            });
        },
        prepareDeploy: function (callback) {

            exec('git branch | grep "*"', function (err, stdout) {
                if (err) { throw err; }
                if (stdout.slice(2).trim() === "master") {
                    throw new Error("OOPS! Don't work from master! The master branch is reserved for Jekyll and GitHub to use and should just be the contents of the _site folder");
                }

                exec('git status | grep "nothing to commit"', function (err, stdout) {
                    if (!stdout) {
                        throw new Error("OOPS! You have uncommitted changes, please commit or discard before attempting to deploy again.");
                    }

                    // Not on master, good job. Now delete master!
                    exec('git branch -D master && git checkout -b master', function (err, stdout) {
                        if (err) { throw err; }
                        callback(null);
                    });
                });
            });

        },
        build: function (callback) {
            exec('jekyll build', callback);
        },
        isolate: function (callback) {
            exec('ls | grep -v _site | xargs rm -rf', function (err, stdout) {
                if (err) { throw err; }
                exec('mv _site/* . && rm -rf _site', callback);
            });
        },
        pushOrigin: function (callback) {
            exec('git add --all && git commit -m "Site compiled and deployed by jekyll-tools"', function (err, stdout) {
                if (err) { throw err; }
                exec('git push -f origin master', callback);
            })
        },
        deploy: function () {
            var jekyll = this;
            this.prepareDeploy(function (err) {
                if (err) { throw err; }
                jekyll.build(function (err, stdout) {
                    if (err) { throw err; }
                    jekyll.isolate(function (err, stdout) {
                        if (err) { throw err; }
                        jekyll.pushOrigin(function (err, stdout) {
                            if (err) { throw err; }
                            jekyll.deployCleanUp(function (err, stdout) {
                                if (err) { throw err; }
                                console.log(color.green("Site successfully deployed to GitHub by jekyll-tools"));
                            })
                        });
                    });
                });
            });
        },
        deployCleanUp: function (callback) {
            exec('git checkout -', callback);
        }
    };

})();