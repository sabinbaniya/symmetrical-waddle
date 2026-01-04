import configDB from "../models/Config.js";

export async function GetUsdToSweepstakeValue() {
    const config = await configDB.findOne({ key: "usdToSweepstakeBalance" });

    return config.value;
}

export async function GetSweepstakeBalanceForDeposit(deposit) {
    const usdToSweepstakeValue = await GetUsdToSweepstakeValue();

    return Math.round((deposit * 100) / usdToSweepstakeValue) / 100;
}
