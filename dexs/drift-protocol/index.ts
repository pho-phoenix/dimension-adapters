import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { queryDune } from "../../helpers/dune";
import { BreakdownAdapter } from "../../adapters/types";

const DAILY_VOL_ENDPOINT =
  "https://mainnet-beta.api.drift.trade/stats/24HourVolume";

const DUNE_QUERY_ID = "3756979";

type DimentionResult = {
  dailyVolume?: number;
  dailyFees?: number;
  dailyUserFees?: number;
  dailyRevenue?: number;
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

async function getPerpDimensions(): Promise<DimentionResult> {
  const resultRows = await queryDune(DUNE_QUERY_ID);

  const marketRows = resultRows.filter(
    (row) => row.market_index !== null && row.market_index >= 0
  );
  // const summaryRow = resultRows.find((row) => row.market_index === null);

  // Perp Volume
  const dailyVolume = sum(marketRows.map((row) => row.total_volume as number));

  // All taker fees paid
  const dailyFees = sum(marketRows.map((row) => row.total_taker_fee as number));

  // All taker fees paid, minus maker rebates paid - not sure if this should be used as the "dailyFees" number instead.
  const dailyRevenue = sum(
    marketRows.map((row) => row.total_revenue as number)
  );

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
  };
}

async function getSpotDimensions(): Promise<DimentionResult> {
  const volumeResponse = await httpGet(
    `${DAILY_VOL_ENDPOINT}?spotMarkets=true`
  );

  const rawVolumeQuotePrecision = volumeResponse.data.volume;

  // Volume will be returned in 10^6 precision
  const dailyVolume =
    rawVolumeQuotePrecision.length >= 6
      ? Number(rawVolumeQuotePrecision.slice(0, -6))
      : 0;

  return { dailyVolume };
}

async function fetch(type: "perp" | "spot") {
  const timestamp = Date.now() / 1e3;

  if (type === "perp") {
    const results = await getPerpDimensions();

    return {
      ...results,
      timestamp,
    };
  } else {
    const results = await getSpotDimensions();

    return {
      ...results,
      timestamp: Date.now() / 1e3,
    };
  }
}

// Used to replace "fetch" to disable a query if it starts failing
const emtry = async (timestamp: number) => {
  return { timestamp };
};

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: {
      [CHAIN.SOLANA]: {
        fetch: () => fetch("spot"),
        runAtCurrTime: true,
        start: 1690239600,
      },
    },
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch: () => fetch("perp"),
        runAtCurrTime: true,
        start: 1690239600,
      },
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
