
export interface Config {
    restAPIBaseUrl: string,
    wsBaseUrl: string,
    account: {
        exchangeName: string,
        exchangeAddress: string,
        accountAddress: string,
        accountId: number,
        apiKey: string,
        publicKeyX: string,
        publicKeyY: string,
        privateKey: string
    },
    pair: string,
    maxBuyPrice: string,
    minSellPrice: string,
    "reconnectWsAfterMissedPingSeconds": number
}

export interface Order {
        exchange: string,
        accountId: number,
        storageId: number,
        sellToken: {
            tokenId: string,
            volume: string
        },
        buyToken : {
            tokenId : string,
            volume : string
        },
        allOrNone: boolean,
        fillAmountBOrS: boolean, // true => buy
        validUntil: number,
        maxFeeBips: number,
        orderType: 'LIMIT_ORDER'| 'TAKER_ONLY'| 'MAKER_ONLY'|'AMM',
        eddsaSignature?: string,
        label?: number
}