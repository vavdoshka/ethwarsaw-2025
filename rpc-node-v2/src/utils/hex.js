function toHexQuantity(value) {
  const bigint = typeof value === "bigint" ? value : BigInt(value);
  if (bigint < 0n) {
    throw new Error("Hex quantity cannot be negative");
  }
  return `0x${bigint.toString(16)}`;
}

function pad32Hex(value) {
  const bigint = typeof value === "bigint" ? value : BigInt(value);
  if (bigint < 0n) {
    throw new Error("Cannot encode negative value");
  }
  return `0x${bigint.toString(16).padStart(64, "0")}`;
}

function padAddress32Hex(address) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

module.exports = {
  toHexQuantity,
  pad32Hex,
  padAddress32Hex
};
