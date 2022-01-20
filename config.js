'use strict';
const dotenv = require('dotenv');
const assert = require('assert');

dotenv.config();

const {
  HTTPS_ENDPOINT,
  WSS_ENDPOINT,
  API_TOKEN,
} = process.env;

assert(HTTPS_ENDPOINT || HTTPS_ENDPOINT, "Create an '.env' file and fill in the details.");


module.exports = {
  httpsEndpoint: HTTPS_ENDPOINT,
  wssEndpoint: WSS_ENDPOINT,
  apiToken: API_TOKEN,
};

