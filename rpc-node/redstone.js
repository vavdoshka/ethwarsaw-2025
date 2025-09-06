import {
  requestDataPackages,
  getSignersForDataServiceId,
} from "@redstone-finance/sdk";

const dataPackages = await requestDataPackages({
  dataServiceId: "redstone-primary-prod",
  dataPackagesIds: ["ETH", "BTC"],
  uniqueSignersCount: 2,
  waitForAllGatewaysTimeMs: 1000,
  maxTimestampDeviationMS: 60 * 1000,
  authorizedSigners: getSignersForDataServiceId("redstone-primary-prod"),
  ignoreMissingFeed: true,
});


console.log(dataPackages.ETH);