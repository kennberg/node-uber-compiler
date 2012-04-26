uber-compiler
======================

The uber compiler compiles your client-side JS and CSS using Google Closure compiler, soy templates and LESS.
These are my favourite tools for developing lean webapps.

Features:

  * Google Closure Compiler, Closure Templates, LESS.
  * No need to restart the server. It watches files for changes and then re-compiles as soon as changes are detected.
  * Caches results, so compilation only happens on changes.

How to use
======================

Installation inside your server directory:

    git clone https://github.com/kennberg/node-uber-compiler uber-compiler
    cd uber-compiler
    npm install

In your server.js do this before the service starts:

    var rootPath = process.cwd();
    var uberOptions = {
      jsPaths: [
        rootPath + '/static/js/lib/jquery-1.7.2.js',
        rootPath + '/static/js/lib/underscore.js',
        rootPath + '/static/js/lib/backbone.js',
        rootPath + '/static/js/init.js',
        rootPath + '/static/js/model/',
        rootPath + '/static/js/view/',
        rootPath + '/static/js/router/',
        rootPath + '/static/js/main.js',
      ],
      cssPaths: [ rootPath + '/static/css' ],
      outputDir: rootPath + '/static/cached/',
    };
    var uberCompiler = require('./uber-compiler')(uberOptions);
    uberCompiler.run();

Note that the compiler respects the order of the paths and can handle both files and directories.

The compiler outputs 'cached.js' and 'cached.css' into outputDir specified in the options. You can include these in the HTML head tag.

More info
======================

For the latest Google Closure Compiler and Template files visit:

  * http://closure-compiler.googlecode.com/files/compiler-latest.zip
  * http://closure-templates.googlecode.com/files/closure-templates-for-javascript-latest.zip

See http://code.google.com/closure/compiler/docs/api-ref.html for more
details on the compiler options.

License
======================
Apache v2. See the LICENSE file.
