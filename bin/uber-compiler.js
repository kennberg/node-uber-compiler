#!/usr/bin/env node

require = require('esm')(module);
require('../cli.js').cli(process.argv);
