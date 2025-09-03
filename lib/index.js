const check = require('./check');
const scan = require('./scan');
const config = require('./config');

module.exports = {
  ...check,
  ...scan,
  ...config,
};

