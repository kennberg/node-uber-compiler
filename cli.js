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

var path = require('path');
import arg from 'arg';


function parseArgumentsIntoOptions(rawArgs) {
  const args = arg({
    '--config': String,
  }, {
    argv: rawArgs.slice(2),
  });
  return {
    config: args['--config'] || ''
  };
}


module.exports.cli = function(args) {
  var options = parseArgumentsIntoOptions(args);
  if (!options.config) {
    console.error('Option --config is required.');
  }

  var config = require(path.join(process.cwd(), options.config));
  if (!config.endCallback) {
    config.endCallback = function() {
      console.log('Resources compiled.');
      process.exit();
    };
  }

  var uberCompiler = require('./index.js')(config);
  uberCompiler.run();
};
