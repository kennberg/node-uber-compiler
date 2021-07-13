var path = require('path');

var rootPath = process.cwd();
var uberOptions = {
  jsPaths: [
    path.join(rootPath, 'testapp.js'),
  ],
  outputDir: rootPath,
  debug: false
};
var uberCompiler = require('../index.js')(uberOptions);
uberCompiler.run();
