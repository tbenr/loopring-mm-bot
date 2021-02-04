# loopring-mm-bot
A simple market maker bot for loopring 3

## configuration

configuration is read in `config.json` from working dirirectory. The file must follow this structure:
```
{
    "restAPIBaseUrl": "https://api3.loopring.io",
    "wsBaseUrl": "wss://ws.api3.loopring.io",
    "account": {
        "exchangeName": "Loopring Exchange v2",
        "exchangeAddress": "0x0BABA1Ad5bE3a5C0a66E7ac838a129Bf948f1eA4",
        "accountAddress": "0x...",
        "accountId": 0,
        "apiKey": "...",
        "publicKeyX": "0x...",
        "publicKeyY": "0x...",
        "privateKey": "0x..."
    },
    "pair": "DAI-USDT",
    "maxBuyPrice": "1.0002",
    "minSellPrice": "1.0000",
    "reconnectWsAfterMissedPingSeconds": 60
}
```

## implemented strategy
the bot allocates available funds with buy\sell orders with the minimum spread possible.

## TODO
- [ ] add tests
- [ ] allow change current orders to follow changes in order book
- [ ] add max amount to limit the allocated fund
- [ ] honor maximum order amounts of token configuration
