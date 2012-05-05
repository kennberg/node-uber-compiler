/**
 * Uber Compiler v0.3.1 for Node.js
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
var less = require('less');
var path = require('path');
var util = require('util');
var _ = require('underscore');


module.exports = function(options) {
  return new UberCompiler(options);
};


/**
 * The uber compiler compiles your client-side JS and CSS using Google Closure
 * compiler, soy templates and LESS.
 *
 * Options:
 * jsPaths - array of absolute paths to js/soy files or directories with js/soy files.
 * cssPaths - array of absolute paths to css/less files or directories with css/less files.
 * outputDir - absolute path to where the compiled files will be written.
 * debug - true reduces compilation time and only compresses whitespace.
 * useHash - generates dynamic output filenames based on the current options - use
 *     getJsFilename() and getCssFilename() methods in your templates.
 *
 * Advanced options:
 * warningLevel - string used for Closure Compiler to control what warnings to output.
 * compileMode - string specifying the compile mode for Google Closure.
 * prettyPrint - boolean to toggle pretty formatting of JS output.
 */
UberCompiler = function(options) {
  this.jsPaths = options.jsPaths || [];
  this.cssPaths = options.cssPaths || [];
  this.outputDir = options.outputDir || '/tmp/';
  this.useHash = !!options.useHash;

  // Defaults based on debug.
  this.compileMode = (options.debug ? 'WHITESPACE_ONLY' : 'SIMPLE_OPTIMIZATIONS');
  this.prettyPrint = !!options.debug;

  // User can also override the advanced options.
  if (typeof options.compileMode != 'undefined')
    this.compileMode = options.compileMode;
  if (typeof options.prettyPrint != 'undefined')
    this.prettyPrint = options.prettyPrint;
  this.warningLevel = options.warningLevel || 'QUIET';

  this.files = [];
  this.hash = (this.useHash ? this._getHash() : '');
};


UberCompiler.prototype.run = function() {
  // TODO: get current timestamp and base compile off of that.
  this._watch();
  this._compileJs();
  this._compileCss();
};


UberCompiler.prototype.terminate = function() {
  this._unwatch();
};


/**
 * Returns the name of the output javascript file.
 */
UberCompiler.prototype.getJsFilename = function() {
  return 'cached' + this.hash + '.js';
};


/**
 * Returns the name of the output css file.
 */
UberCompiler.prototype.getCssFilename = function() {
  return 'cached' + this.hash + '.css';
};


/**
 * Generate simple unsecure hash based on all the options in this object.
 */
UberCompiler.prototype._getHash = function() {
  var hash = 275329; // Salt
  for (var property in this) {
    switch (typeof this[property]) {
      case 'object': {
        var arr = this[property];
        for (var i in arr) {
          if (typeof arr[i] === 'string')
            hash = this._addToHash(hash, arr[i]);
        }
        break;
      }
      case 'boolean':
        hash = this._addToHash(hash, this[property] ? 'Y' : 'n');
        break;
      case 'string':
        hash = this._addToHash(hash, this[property]);
        break;
      default:
    }
  }
  return hash;
};


UberCompiler.prototype._addToHash = function(hash, text) {
  for (var i = 0, l = text.length; i < l; i++) {
    var code = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + code;
    hash = hash & hash;
  }
  return hash;
};


UberCompiler.prototype._compileJsFinal = function(soyJsPath) {
  var fileExtensionRegex = this._getFileExtensionRegex('js');
  var jsFiles = [];
  for (var i = 0, l = this.jsPaths.length; i < l; i++)
    jsFiles = jsFiles.concat(this._findFiles(this.jsPaths[i], fileExtensionRegex));
  var jsCmd = 'java -jar ' + path.join(__dirname, 'third-party/compiler.jar');

  jsCmd += ' --compilation_level ' + this.compileMode;
  jsCmd += ' --warning_level ' + this.warningLevel;
  if (this.prettyPrint) 
    jsCmd += ' --formatting pretty_print';

  for (var i = 0, l = jsFiles.length; i < l; i++) {
    jsCmd += ' --js ' + jsFiles[i];
  }
  if (soyJsPath) {
    jsCmd += ' --js ' + path.join(__dirname, 'third-party/soyutils.js');
    jsCmd += ' --js ' + soyJsPath;
  }
  jsCmd += ' > ' + path.join(this.outputDir, this.getJsFilename());

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

  var soyJsPath = path.join(this.outputDir, 'soy.js');
  var fileExtensionRegex = this._getFileExtensionRegex('soy');
  var soyFiles = [];
  for (var i = 0, l = this.jsPaths.length; i < l; i++)
    soyFiles = soyFiles.concat(this._findFiles(this.jsPaths[i], fileExtensionRegex));

  if (soyFiles && soyFiles.length) {
    var soyCmd = 'java -jar ' + path.join(__dirname, 'third-party/SoyToJsSrcCompiler.jar');
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
    fs.writeFileSync(path.join(this.outputDir, this.getCssFilename()), tree.toCSS({ compress: true }));
    util.log('Successfully compressed CSS files');
  }, this));
};


UberCompiler.prototype._watch = function() {
  var watchHelper = _.bind(function(searchPath) {
    var cmd = 'find ' + searchPath + ' | grep -E "\.(js|soy|css|less)$"';
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


UberCompiler.prototype._onFileChange = function(file) {
  util.log('Detected file change: ' + file);

  var fileExtensionPattern = this._getFileExtensionRegex('js|soy');
  if (file.match(fileExtensionPattern)) {
    this._compileJs();
  }
  else {
    fileExtensionPattern = this._getFileExtensionRegex('css|less');
    if (file.match(fileExtensionPattern)) {
      this._compileCss();
    }
  }
};


UberCompiler.prototype._getFileExtensionRegex = function(fileExtensions) {
  return new RegExp("^.*\.(" + fileExtensions + ")$");
};


UberCompiler.prototype._findFiles = function(searchPath, fileExtensionPattern) {
  var files = [];
  var stats;
  try {
    stats = fs.statSync(searchPath);
  }
  catch (exception) {
  }

  if (stats) {
    if (stats.isDirectory()) {
      var fileNames = fs.readdirSync(searchPath);
      if (fileNames && fileNames.length) {
        fileNames.sort();
        for (var i = 0, l = fileNames.length; i < l; i++) {
          // Skip backup file names that start with ._
          if (fileNames[i].length > 2 && fileNames[i].substr(0, 2) == '._')
            continue;
          files = files.concat(this._findFiles(path.join(searchPath, fileNames[i]), fileExtensionPattern));
        }
      }
    }
    else if (searchPath.match(fileExtensionPattern)) {
      files.push(searchPath);
    }
  } // stats
  else {
    util.error('Error retrieving stats for path: ' + searchPath);
  }
  return files;
};


