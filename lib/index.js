const check = require('./check');
const scan = require('./scan');
const config = require('./config');
const deepl = require('./deepl');

module.exports = {
  ...check,
  ...scan,
  ...config,
  ...deepl,
};
