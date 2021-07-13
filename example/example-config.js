var path = require('path');


// You can try to use this as config for cli:
// uber-compiler --config example-config.js
module.exports = {
  jsPaths: [
    path.join(__dirname, 'testapp.js'),
  ],
  outputDir: __dirname,
  debug: false
};
