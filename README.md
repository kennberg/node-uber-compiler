uber-compiler
======================

The uber compiler compiles your client-side JS and CSS using Google Closure compiler, soy templates and LESS.
These are my favourite tools for developing lean webapps.

Features:

  * Google Closure Compiler, Closure Templates, LESS.
  * No need to restart the server. It watches files for changes and then re-compiles as soon as changes are detected.
  * Caches results, so compilation only happens on changes.
  * Compiles on startup unless source files have not changed.

How to use
======================

Install the latest module using NPM:

    npm i -g google-closure-compiler
    npm i uber-compiler


Alternatively, for manual installation:

    git clone https://github.com/kennberg/node-uber-compiler uber-compiler
    cd uber-compiler
    npm install

In your server.js do this before the service starts (replace paths with your own):

    var path = require('path');

    var rootPath = process.cwd();
    var uberOptions = {
      jsPaths: [
        path.join(rootPath, 'public/js/lib/jquery-1.7.2.js'),
        path.join(rootPath, 'public/js/lib/underscore.js'),
        path.join(rootPath, 'public/js/lib/backbone.js'),
        path.join(rootPath, 'public/js/init.js'),
        path.join(rootPath, 'public/js/model/'),
        path.join(rootPath, 'public/js/view/'),
        path.join(rootPath, 'public/js/router/'),
        path.join(rootPath, 'public/js/main.js')
      ],
      cssPaths: [ path.join(rootPath, 'public/css') ],
      outputDir: path.join(rootPath, 'public/cached'),
      debug: false
    };
    var uberCompiler = require('uber-compiler')(uberOptions);
    uberCompiler.run();

Note that the compiler respects the order of the paths and can handle both files and directories.

The compiler, by default, outputs 'cached.js' and 'cached.css' into outputDir specified in the options. You can include these in the HTML head tag:

    <html>
    <head>
    <script type="text/javascript" src="cached/cached.js"></script>
    <link rel="stylesheet" type="text/css" href="cached/cached.css" />
    </head>
    <body>
      <p>Hello world!</p>
    </body>
    </html>

Options:

  * jsPaths - array of absolute paths to js/soy files or directories with js/soy files.
  * cssPaths - array of absolute paths to css/less files or directories with css/less files.
  * outputDir - absolute path to where the compiled files will be written.
  * dontWatchFiles - turn off re-compile when files change. Might want to use this in production.
  * debug - true reduces compilation time and only compresses whitespace.
  * useHash - generates dynamic output filenames based on the current options - use getJsFilename() and getCssFilename() methods in your templates.

Advanced options:

  * warningLevel - string used for Closure Compiler to control what warnings to output.
  * compileMode - string specifying the compile mode for Google Closure.
  * prettyPrint - boolean to toggle pretty formatting of JS output.
  * endCallback - called when compilation of all resources completes.
  * externPaths - array of absolute paths to js files or directories with js files to use for extern declarations.

More info
======================

For the latest Google Closure Compiler and Template files visit:

  * npm i -g google-closure-compiler
  * https://github.com/google/closure-templates/releases

Latest soy compiler can be found at https://repo1.maven.org/maven2/com/google/template/soy/ which also has the latest soyutils js file.

See http://code.google.com/closure/compiler/docs/api-ref.html for more
details on the compiler options.

See http://lesscss.org/ for more details about LESS.

License
======================
Apache v2. See the LICENSE file.
