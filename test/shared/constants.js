const ACCESS_LIST_TYPE = { Empty: 0, Hacker: 1 };
const AVG_BLOCK_TIME = 10;
const HACKER_RATIO = 1 / 10;
const N_DEPOSITS = 20;
const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const POOL_TYPE = { Native: 0, Token: 1 };
const WITHDRAWALS_TIMEOUT = N_DEPOSITS * 3000;

module.exports = {
    ACCESS_LIST_TYPE,
    AVG_BLOCK_TIME,
    HACKER_RATIO,
    NATIVE,
    N_DEPOSITS,
    POOL_TYPE,
    WITHDRAWALS_TIMEOUT,
}