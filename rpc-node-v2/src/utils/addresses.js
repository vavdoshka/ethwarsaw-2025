const { ethers } = require("ethers");

function normalizeAddress(address) {
  if (typeof address !== "string" || !ethers.isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  return address.toLowerCase();
}

module.exports = {
  normalizeAddress
};
