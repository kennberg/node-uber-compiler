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
var less = require('less');
var path = require('path');
var _ = require('underscore');


module.exports = function(options) {
  return new UberCompiler(options);
};


module.exports.getFileExtensionRegex = function(fileExtensions) {
  return new RegExp("^.*\.(" + fileExtensions + ")$");
};


module.exports.findFiles = function(searchPath, fileExtensionPattern) {
  var stats;
  try {
    stats = fs.statSync(searchPath);
  }
  catch (exception) {
    console.error(exception);
  }
  if (!stats) {
    console.error('Error retrieving stats for path: ' + searchPath);
    return [];
  }

  var files = [];
  if (stats.isDirectory()) {
    var fileNames = fs.readdirSync(searchPath);
    if (fileNames && fileNames.length) {
      fileNames.sort();
      for (var i = 0, l = fileNames.length; i < l; i++) {
        // Skip backup file names that start with ._
        if (fileNames[i].length > 2 && fileNames[i].substr(0, 2) == '._') {
          continue;
        }
        files = files.concat(module.exports.findFiles(path.join(
            searchPath, fileNames[i]), fileExtensionPattern));
      }
    }
  }
  else if (searchPath.match(fileExtensionPattern)) {
    files.push(searchPath);
  }
  return files;
};


/**
 * The uber compiler compiles your client-side JS and CSS using Google Closure
 * compiler, soy templates and LESS.
 *
 * Options:
 * jsPaths - array of absolute paths to js/soy files or directories with js/soy files.
 * cssPaths - array of absolute paths to css/less files or directories with css/less files.
 * outputDir - absolute path to where the compiled files will be written.
 * moduleName - module name used for filename of the outputs.
 * dontWatchFiles - turn off re-compile when files change. Might want to use this in production.
 * debug - true reduces compilation time and only compresses whitespace.
 * useHash - generates dynamic output filenames based on the current options - use
 *     getJsFilename() and getCssFilename() methods in your templates.
 *
 * Advanced options:
 * warningLevel - string used for Closure Compiler to control what warnings to output.
 * compileMode - string specifying the compile mode for Google Closure.
 * prettyPrint - boolean to toggle pretty formatting of JS output.
 * endCallback - called when compilation of all resources completes.
 * externPaths - array of absolute paths to js files or directories with js files to use for extern declarations.
 *
 * Committer: When editing options, please also update the README file.
 */
UberCompiler = function(options) {
  this.jsPaths = options.jsPaths || [];
  this.externPaths = options.externPaths || [];
  this.cssPaths = options.cssPaths || [];
  this.outputDir = options.outputDir || '/tmp/';
  this.moduleName = options.moduleName || 'cached';
  this.useHash = !!options.useHash;
  this.dontWatchFiles = !!options.dontWatchFiles;

  // Defaults based on debug.
  this.compileMode = (options.debug ? 'WHITESPACE_ONLY' : 'SIMPLE_OPTIMIZATIONS');
  this.prettyPrint = !!options.debug;
  this.compressCss = !options.debug;

  // User can also override the advanced options.
  if (typeof options.compileMode != 'undefined')
    this.compileMode = options.compileMode;
  if (typeof options.prettyPrint != 'undefined')
    this.prettyPrint = options.prettyPrint;
  this.warningLevel = options.warningLevel || 'QUIET';

  this.files = [];
  this.hash = (this.useHash ? this.getHash_() : '');

  this.endCallback = options.endCallback || null;

  this.fileChangedJs = false;
  this.fileChangedCss = false;
  this.fileChangedTimer = null;
  this.fileChangeMap = {};
};


UberCompiler.prototype.run = function() {
  // TODO: get current timestamp and base compile off of that.
  if (!this.dontWatchFiles)
    this.watch_();
  if (this.shouldCompileJs_())
    this.compileJs_();
  if (this.shouldCompileCss_())
    this.compileCss_();
  this.checkEnd_();
};


UberCompiler.prototype.terminate = function() {
  if (!this.dontWatchFiles)
    this.unwatch_();
};


/**
 * Returns the name of the output javascript file.
 */
UberCompiler.prototype.getJsFilename = function() {
  return this.moduleName + this.hash + '.js';
};


/**
 * Returns the name of the output css file.
 */
UberCompiler.prototype.getCssFilename = function() {
  return this.moduleName + this.hash + '.css';
};


/**
 * Returns the name of the output css source map file.
 */
UberCompiler.prototype.getCssMapFilename = function() {
  return this.moduleName + this.hash + '.css.map';
};


/**
 * Generate simple unsecure hash based on all the options in this object.
 */
UberCompiler.prototype.getHash_ = function() {
  var hash = 275329; // Salt
  for (var property in this) {
    switch (typeof this[property]) {
      case 'object': {
        var arr = this[property];
        for (var i in arr) {
          if (typeof arr[i] === 'string')
            hash = this.addToHash_(hash, arr[i]);
        }
        break;
      }
      case 'boolean':
        hash = this.addToHash_(hash, this[property] ? 'Y' : 'n');
        break;
      case 'string':
        hash = this.addToHash_(hash, this[property]);
        break;
      default:
    }
  }
  return hash;
};


UberCompiler.prototype.addToHash_ = function(hash, text) {
  for (var i = 0, l = text.length; i < l; i++) {
    var code = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + code;
    hash = hash & hash;
  }
  return hash;
};


UberCompiler.prototype.compileJsFinal_ = function(soyJsPath) {
  var fileExtensionRegex = module.exports.getFileExtensionRegex('js');
  var jsFiles = [];
  for (var i = 0, l = this.jsPaths.length; i < l; i++)
    jsFiles = jsFiles.concat(module.exports.findFiles(this.jsPaths[i], fileExtensionRegex));
  var externFiles = [];
  for (var i = 0, l = this.externPaths.length; i < l; i++)
    externFiles = externFiles.concat(module.exports.findFiles(this.externPaths[i], fileExtensionRegex));
  var jsCmd = 'google-closure-compiler';

  jsCmd += ' --compilation_level ' + this.compileMode;
  jsCmd += ' --warning_level ' + this.warningLevel;
  if (this.prettyPrint) 
    jsCmd += ' --formatting pretty_print';

  for (var i = 0, l = externFiles.length; i < l; i++) {
    jsCmd += ' --externs ' + externFiles[i];
  }
  for (var i = 0, l = jsFiles.length; i < l; i++) {
    jsCmd += ' --js ' + jsFiles[i];
  }
  if (soyJsPath) {
    jsCmd += ' --js ' + path.join(__dirname, 'third-party/checks.js');
    jsCmd += ' --js ' + path.join(__dirname, 'third-party/soy-2021-02-01-soyutils_usegoog.js');
    jsCmd += ' --js ' + soyJsPath;
  }
  jsCmd += ' > ' + path.join(this.outputDir, this.getJsFilename());

  childProcess.exec(jsCmd, _.bind(function(error, stdout, stderr) {
    if (stderr && stderr.length) {
      console.error(stderr);
      return;
    }
    console.log('Successfully compiled JS files');
    this.compilingJs_ = false;
    this.checkEnd_();

    if (soyJsPath) {
      childProcess.exec('rm ' + soyJsPath);
      soyJsPath = null;
    }
  }, this));
};


UberCompiler.prototype.compileJs_ = function() {
  console.log('Compiling JS files');
  this.compilingJs_ = true;

  var soyJsPath = path.join(this.outputDir, 'soy.js');
  var fileExtensionRegex = module.exports.getFileExtensionRegex('soy');
  var soyFiles = [];
  for (var i = 0, l = this.jsPaths.length; i < l; i++)
    soyFiles = soyFiles.concat(module.exports.findFiles(this.jsPaths[i], fileExtensionRegex));

  if (soyFiles && soyFiles.length) {
    var soyCmd = 'java -jar ' + path.join(__dirname, 'third-party/soy-2021-02-01-SoyToJsSrcCompiler.jar');
    soyCmd += ' --outputPathFormat ' + soyJsPath;
    var srcs = [];
    for (var i = 0, l = soyFiles.length; i < l; i++)
      srcs.push(soyFiles[i]);
    soyCmd += ' --srcs ' + srcs.join(',');

    childProcess.exec(soyCmd, _.bind(function(error, stdout, stderr) {
      if (stderr && stderr.length) {
        console.error(stderr);
        return;
      }
      this.compileJsFinal_(soyJsPath);
    }, this));
  }
  else {
    this.compileJsFinal_();
  }
};


UberCompiler.prototype.compileCss_ = function() {
  this.compilingCss_ = true;

  var fileExtensionRegex = module.exports.getFileExtensionRegex('css|less');
  var files = [];
  for (var i = 0, l = this.cssPaths.length; i < l; i++) {
    files = files.concat(module.exports.findFiles(this.cssPaths[i], fileExtensionRegex));
  }

  console.log('Compressing ' + files.length + ' CSS files');

  var data = '';
  for (var i = 0, l = files.length; i < l; i++) {
    var fileData = fs.readFileSync(files[i]);
    if (fileData && fileData.length) {
      data += fileData;
    }
  }

  var options = {
    compress: this.compressCss,
    sourceMap: {},
  };
  less.render(data, options, _.bind(function(err, output) {
    if (err) {
      var message = 'CSS ' + err.type + ' Error: ' + err.message;
      if (err.extract && err.extract.length) {
        for (var i = 0, l = err.extract.length; i < l; i++) {
          message += '\n  ' + err.extract[i];
        }
      }
      console.error(message);
      return;
    }
    fs.writeFileSync(path.join(this.outputDir, this.getCssFilename()), output.css);
    if (output.map) {
      fs.writeFileSync(path.join(this.outputDir, this.getCssMapFilename()), output.map);
    }

    console.log('Successfully compressed CSS files');
    this.compilingCss_ = false;
    this.checkEnd_();
  }, this));
};


UberCompiler.prototype.watch_ = function() {
  var watchHelper = _.bind(function(searchPath) {
    var cmd = 'find ' + searchPath + ' | grep -E "\.(js|soy|css|less)$"';
    childProcess.exec(cmd, _.bind(function(error, stdout, stderr) {
      var files = stdout.trim().split("\n");
      files.forEach(_.bind(function(file) {
        this.files.push(file);

        fs.watchFile(file, { interval: 500 }, _.bind(function(curr, prev) {
          var currMTime = +curr.mtime.valueOf();
          var prevMTime = +prev.mtime.valueOf();

          // Check to make sure that this file has not already been flagged for change.
          if (currMTime <= prevMTime || (
              typeof this.fileChangeMap[file] !== 'undefined' &&
              this.fileChangeMap[file] >= currMTime)) {
            return;
          }
          this.fileChangeMap[file] = currMTime;

          // Proceed to handle file change.
          this.onFileChange_(file);
        }, this)); // watch file

      }, this)); // for each file
    }, this)); // childProcess.exec
  }, this); // watch helper

  for (var i = 0, l = this.externPaths.length; i < l; i++)
    watchHelper(this.externPaths[i]);
  for (var i = 0, l = this.jsPaths.length; i < l; i++)
    watchHelper(this.jsPaths[i]);
  for (var i = 0, l = this.cssPaths.length; i < l; i++)
    watchHelper(this.cssPaths[i]);
};


UberCompiler.prototype.unwatch_ = function() {
  this.files.forEach(function(file) {
    fs.unwatchFile(file);
  });
  this.files = [];
};


UberCompiler.prototype.onFileChange_ = function(file) {
  console.log('Detected file change: ' + file);

  var fileExtensionPattern = module.exports.getFileExtensionRegex('js|soy');
  if (file.match(fileExtensionPattern)) {
    this.fileChangedJs = true;
  }
  else {
    fileExtensionPattern = module.exports.getFileExtensionRegex('css|less');
    if (file.match(fileExtensionPattern)) {
      this.fileChangedCss = true;
    }
  }

  // De-bouce in case a few files were saved at the same time.
  clearTimeout(this.fileChangedTimer);
  this.fileChangedTimer = setTimeout(_.bind(function() {
    this.fileChangedTimer = null;

    if (this.fileChangedJs) {
      this.fileChangedJs = false;
      this.compileJs_();
    }
    if (this.fileChangedCss) {
      this.fileChangedCss = false;
      this.compileCss_();
    }
  }, this), 500);
};


UberCompiler.prototype.shouldCompileJs_ = function() {
  return this.shouldCompile_(this.jsPaths, this.getJsFilename(), 'js|soy');
};


UberCompiler.prototype.shouldCompileCss_ = function() {
  return this.shouldCompile_(this.cssPaths, this.getCssFilename(), 'css|less');
};


UberCompiler.prototype.shouldCompile_ = function(inputPaths, outputFilename, fileExtensions) {
  if (!inputPaths.length) {
    return false;
  }

  var result = false;
  var outputPath = path.join(this.outputDir, outputFilename);
  var outputTime = 0;
  try {
    var stats = fs.statSync(outputPath);
    if (stats && typeof stats.mtime !== 'undefined')
      outputTime = stats.mtime.getTime();
  }
  catch (exception) {
  }
  if (!outputTime)
    return true;

  var fileExtensionRegex = module.exports.getFileExtensionRegex(fileExtensions);
  for (var i = 0, l = inputPaths.length; i < l; i++) {
    var files = module.exports.findFiles(inputPaths[i], fileExtensionRegex);
    for (var j = 0, m = files.length; j < m; j++) {
      try {
        var stats = fs.statSync(files[j]);
        if (stats && typeof stats.mtime !== 'undefined') {
          if (stats.mtime.getTime() > outputTime) {
            result = true;
            break;
          }
        }
      }
      catch (exception) {
      }
    } // for each files
  } // for each input path

  return result;
};


UberCompiler.prototype.checkEnd_ = function() {
  if (!this.compilingJs_ && !this.compilingCss_) {
    if (typeof this.endCallback === 'function')
      this.endCallback();
  }
};

