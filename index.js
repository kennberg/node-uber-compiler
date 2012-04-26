/**
 * Uber Compiler for Node.js
 *
 * Copyright 2012 Alex Kennberg (https://github.com/kennberg/node-uber-compiler)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var childProcess = require('child_process');
var fs = require('fs');
var util = require('util');
var _ = require('underscore');
var less = require('less');


module.exports = function(options) {
  return new UberCompiler(options);
};


UberCompiler = function(options) {
  this.jsPaths = options.jsPaths || [];
  this.cssPaths = options.cssPaths || [];
  this.outputDir = options.outputDir || '/tmp/';
  this.compileMode = options.compileMode || 'WHITESPACE_ONLY';
  if (typeof options.prettyPrint != 'undefined')
    this.prettyPrint = options.prettyPrint;
  this.warningLevel = options.warningLevel || 'QUIET';
  this.files = [];
};


UberCompiler.prototype.run = function() {
  this._watch();
  this._compileJs();
  this._compileCss();
};


UberCompiler.prototype.terminate = function() {
  this._unwatch();
};


UberCompiler.prototype._compileJsFinal = function(soyJsPath) {
  var fileExtensionRegex = this._getFileExtensionRegex('js');
  var jsFiles = [];
  for (var i = 0, l = this.jsPaths.length; i < l; i++)
    jsFiles = jsFiles.concat(this._findFiles(this.jsPaths[i], fileExtensionRegex));
  var jsCmd = 'java -jar ' + __dirname + '/third-party/compiler.jar';

  jsCmd += ' --compilation_level ' + this.compileMode;
  jsCmd += ' --warning_level ' + this.warningLevel;
  if (this.prettyPrint) 
    jsCmd += ' --formatting pretty_print';

  for (var i = 0, l = jsFiles.length; i < l; i++) {
    jsCmd += ' --js ' + jsFiles[i];
  }
  if (soyJsPath) {
    jsCmd += ' --js ' + __dirname + '/third-party/soyutils.js';
    jsCmd += ' --js ' + soyJsPath;
  }
  jsCmd += ' > ' + this.outputDir + '/cached.js';

  childProcess.exec(jsCmd, _.bind(function(error, stdout, stderr) {
    if (stderr && stderr.length) {
      util.error(stderr);
      return;
    }
    util.log('Successfully compiled JS files');
  }, this));
};


UberCompiler.prototype._compileJs = function() {
  util.log('Compiling JS files');

  var soyJsPath = this.outputDir + '/soy.js';
  var fileExtensionRegex = this._getFileExtensionRegex('soy');
  var soyFiles = [];
  for (var i = 0, l = this.jsPaths.length; i < l; i++)
    soyFiles = soyFiles.concat(this._findFiles(this.jsPaths[i], fileExtensionRegex));

  if (soyFiles && soyFiles.length) {
    var soyCmd = 'java -jar ' + __dirname + '/third-party/SoyToJsSrcCompiler.jar';
    soyCmd += ' --outputPathFormat ' + soyJsPath;
    for (var i = 0, l = soyFiles.length; i < l; i++)
      soyCmd += ' ' + soyFiles[i];

    childProcess.exec(soyCmd, _.bind(function(error, stdout, stderr) {
      if (stderr && stderr.length) {
        util.error(stderr);
        return;
      }
      this._compileJsFinal(soyJsPath);
    }, this));
  }
  else {
    this._compileJsFinal();
  }
};


UberCompiler.prototype._compileCss = function() {
  var fileExtensionRegex = this._getFileExtensionRegex('css|less');
  var files = [];
  for (var i = 0, l = this.cssPaths.length; i < l; i++)
    files = files.concat(this._findFiles(this.cssPaths[i], fileExtensionRegex));

  util.log('Compressing ' + files.length + ' CSS files');

  var data = '';
  for (var i = 0, l = files.length; i < l; i++) {
    var fileData = fs.readFileSync(files[i]);
    if (fileData && fileData.length) {
      data += fileData;
    }
  }

  var parser = new(less.Parser)({});
  parser.parse(data, _.bind(function(err, tree) {
    if (err) {
      util.error(err);
      return;
    }
    fs.writeFileSync(this.outputDir + '/cached.css', tree.toCSS({ compress: true }));
    util.log('Successfully compressed CSS files');
  }, this));
};


UberCompiler.prototype._watch = function() {
  var watchHelper = _.bind(function(path) {
    var cmd = 'find ' + path + ' | grep -E "\.(js|soy|css|less)$"';
    childProcess.exec(cmd, _.bind(function(error, stdout, stderr) {
      var files = stdout.trim().split("\n");
      files.forEach(_.bind(function(file) {
        this.files.push(file);
        fs.watchFile(file, { interval: 500 }, _.bind(function(curr, prev) {
          if (curr.mtime.valueOf() != prev.mtime.valueOf() || curr.ctime.valueOf() != prev.ctime.valueOf()) {
            this._onFileChange(file);
          }
        }, this)); // watch file
      }, this)); // for each file
    }, this)); // childProcess.exec
  }, this); // watch helper

  for (var i = 0, l = this.jsPaths.length; i < l; i++)
    watchHelper(this.jsPaths[i]);
  for (var i = 0, l = this.cssPaths.length; i < l; i++)
    watchHelper(this.cssPaths[i]);
};


UberCompiler.prototype._unwatch = function() {
  this.files.forEach(function(file) {
    fs.unwatchFile(file);
  });
  this.files = [];
};


UberCompiler.prototype._onFileChange = function(path) {
  util.log('Detected file change: ' + path);

  var fileExtensionPattern = this._getFileExtensionRegex('js|soy');
  if (path.match(fileExtensionPattern)) {
    this._compileJs();
  }
  else {
    fileExtensionPattern = this._getFileExtensionRegex('css|less');
    if (path.match(fileExtensionPattern)) {
      this._compileCss();
    }
  }
};


UberCompiler.prototype._getFileExtensionRegex = function(fileExtensions) {
  return new RegExp("^.*\.(" + fileExtensions + ")$");
};


UberCompiler.prototype._findFiles = function(path, fileExtensionPattern) {
  var files = [];
  var stats;
  try {
    stats = fs.statSync(path);
  }
  catch (exception) {
  }

  if (stats) {
    if (stats.isDirectory()) {
      var fileNames = fs.readdirSync(path);
      if (fileNames && fileNames.length) {
        fileNames.sort();
        for (var i = 0, l = fileNames.length; i < l; i++) {
          // Skip backup file names that start with ._
          if (fileNames[i].length > 2 && fileNames[i].substr(0, 2) == '._')
            continue;
          files = files.concat(this._findFiles(path + '/' + fileNames[i], fileExtensionPattern));
        }
      }
    }
    else if (path.match(fileExtensionPattern)) {
      files.push(path);
    }
  } // stats
  else {
    util.error('Error retrieving stats for path: ' + path);
  }
  return files;
};

