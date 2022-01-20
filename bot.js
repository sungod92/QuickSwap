const ethers = require('ethers');
const {
    routers,
    factories,
    ABIs
} = require('./addresses/ethereum');
const config = require('./config');
const {
    web3
} = require('./utils/admin');
const {
    abiFetcher
} = require('./helpers/scan');

//*************
//ENTER YOUR DETAILS!


//1. Snipe details
const Spend = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' // Token to use as base, e.g WMATIC 
const Receive = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174' // Token to Buy

const recipientAddress = '' // Wallet Address

const amountToSpend = 2; //Amount of base to spend
var take_profit = 10; //In Percentage
var stop_loss = 10; //In Percentage

//2. Wallet
const Seed = '' // Add wallet seed phrase here

//3. Optional settings
const Slippage = 0


//////Done. Do NOT change code after this!

const amountIn = ethers.utils.parseUnits(amountToSpend.toString(), 'ether')

const routerAddress = routers.quickSwap;
const WSS = config.wssEndpoint;

const SnipeID = (Receive.toLowerCase()).substring(2) //e.g. "f2c96e402c9199682d5ded26d3771c6b192c01af"

var bought = false;
var order = false;
var ETHER = Math.pow(10, 18);

take_profit = take_profit / 100;
stop_loss = stop_loss / 100;


const MethodID = "0xf305d719"
const MethodID2 = "0xe8e33700"

const provider = new ethers.providers.WebSocketProvider(WSS);
const wallet = ethers.Wallet.fromMnemonic(Seed);
const account = wallet.connect(provider);

provider.removeAllListeners();

const router = new ethers.Contract(
    routerAddress,
    [
        'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
        'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
    ],
    account
);

const usdc = new ethers.Contract(
    Spend,
    [
        'function approve(address spender, uint amount) public returns(bool)',
    ],
    account
);


const approval = async () => {
    const tx = await usdc.approve(
        routerAddress,
        amountIn, {
            gasPrice: ethers.utils.parseUnits('40', 'gwei'),
            gasLimit: 210000
        }
    );
    console.log(`After Approve`);
    const receipt = await tx.wait();
    console.log('Transaction receipt Received');
    // console.log(receipt);
}

approval().then(x => {


    console.log(`Connecting to the blockchain`);
    console.log(`Starting to scan the network for a matching transaction based on the config entered`);
    console.log(`As soon as a matching transaction has been found, it will be displayed here`);

    var amountOutMin = 0;
    if (Slippage > 0) {
        router.getAmountsOut(amountIn, [Spend, Receive]).then(amounts => {
            amountOutMin = amounts[1].sub(amounts[1].div(Slippage))
        })
    }
    try {
        provider.on("pending", async (tx) => {
            try {
                if (bought) {
                    provider.removeAllListeners();
                } else {
                    provider.getTransaction(tx).then(function (transaction) {
                        // if (transaction != null && transaction['data'].includes(MethodID2) && transaction['data'].includes(SnipeID) ||
                        //     transaction != null && transaction['data'].includes(MethodID) && transaction['data'].includes(SnipeID)) {
                        if (transaction != null && transaction['data'].includes(SnipeID)) {
                            if (order) return;

                            // console.log(transaction);
                            console.log(`
                                Buying new token
                                =================
                                tokenIn: ${amountIn} ${Receive}
                                tokenOut: ${amountOutMin} ${Spend}
                            `);
                            console.log(`Matching liquidity add transaction found!`);
                            router.swapExactTokensForTokens(
                                amountIn,
                                amountOutMin,
                                [Spend, Receive],
                                recipientAddress,
                                Math.floor(Date.now() / 1000) + 60 * 10, {
                                    gasLimit: transaction.gasLimit,
                                    gasPrice: transaction.gasPrice
                                }
                            ).then(tx => {
                                console.log(tx);
                                console.log('https://polygonscan.com/tx/' + tx['hash']);
                                bought = true
                            }).catch(err => console.log("Error in buy swapExactTokensForTokens " + err.message));

                            order = true;
                            setTimeout(function () {
                                console.log(`Attempting to place a buy order...`);
                            }, 500);
                            setTimeout(function () {
                                console.log('Ctrl+click the link below to and enter your wallet address to check if tokens were bought');
                            }, 1000);
                            setTimeout(function () {
                                console.log('https://polygonscan.com/address/' + recipientAddress);
                            }, 700);
                            setTimeout(function () {
                                console.log("Order placed!");
                            }, 1000);

                        }
                    }).catch(err => console.log("Error in buy getTransaction " + err.message));
                }
            } catch (err) {}
        })
    } catch (err) {
        console.log("Error in buy getTransaction " + err.message);
    }
})


var CAKE_FACTORY_V2 = web3.utils.toChecksumAddress(factories.quickSwap);

async function process(base, token) {
    var token = web3.utils.toChecksumAddress(token);
    var base = web3.utils.toChecksumAddress(base);
    var pair = await (new web3.eth.Contract(ABIs.getPairQuickSwap, CAKE_FACTORY_V2)).methods.getPair(base, token).call()

    console.log("Pair Found "+pair);
    var pair_contract = await (new web3.eth.Contract(ABIs.getPairQuickSwap, pair));
    var is_reversed = (await pair_contract.methods.token0().call()) == token;
    var decimals = await (await new web3.eth.Contract(ABIs.getPairQuickSwap, base)).methods.decimals().call();
    var is_price_in_peg = true;
    var price = await get_price(base, decimals, pair_contract, is_reversed, is_price_in_peg)
    console.log(price)
    return price
}

var get_price = async function (token, decimals, pair_contract, is_reverse, is_price_in_peg) {
    var price,
        peg_reserve = 0,
        token_reserve = 0,
        res = await pair_contract.methods.getReserves().call(),
        reserve0 = res[0],
        reserve1 = res[1];

    if (is_reverse) {
        peg_reserve = reserve0;
        token_reserve = reserve1;
    } else {
        peg_reserve = reserve1;
        token_reserve = reserve0;
    }

    if (token_reserve && peg_reserve) {
        if (is_price_in_peg) {
            // CALCULATE PRICE BY TOKEN PER PEG
            price = (Number(token_reserve) / Number(Math.pow(10, decimals))) / (Number(peg_reserve) / Number(ETHER));
        } else {
            // CALCULATE PRICE BY PEG PER TOKEN
            price = (Number(peg_reserve) / Number(ETHER)) / (Number(token_reserve) / Number(Math.pow(10, decimals)));
        }

        return price;
    }

    return Number(0);
};

function sell() {
    abiFetcher(Receive).then(newAbi => {

        var newRouter = new ethers.Contract(
            routerAddress,
            newAbi,
            account
        );

        newRouter.balanceOf(recipientAddress).then(balance => {
            amountIn = ethers.utils.parseUnits(balance.toString(), 'ether')
            var amountOutMin = 0;
            if (Slippage > 0) {
                router.getAmountsOut(amountIn, [Receive, Spend]).then(amounts => {
                    amountOutMin = amounts[1].sub(amounts[1].div(Slippage))
                })
            }

            provider.on("pending", async (tx) => {
                provider.getTransaction(tx).then(function (transaction) {

                    router.swapExactTokensForTokens(
                        amountIn,
                        amountOutMin,
                        [Receive, Spend],
                        recipientAddress,
                        Date.now() + 1000 * 60 * 10, {
                            gasLimit: transaction.gasLimit,
                            gasPrice: transaction.gasPrice
                        }
                    );

                    setTimeout(function () {
                        console.log(`Attempting to place a sell order...`);
                    }, 500);

                    setTimeout(function () {
                            console.log('Ctrl+click the link below to and enter your wallet address to check if tokens were bought');
                        }, 1000),
                        setTimeout(function () {
                            console.log('https://polygonscan.com/address/' + recipientAddress);
                        }, 700),
                        setTimeout(function () {
                            console.log("Order placed! Shutting down bot.");
                            transaction_complete = true;
                        }, 1000)

                    return;
                }).catch(err => console.log("Error in getting sell tx " + err.message));;
            }).catch(err => console.log("Error in sell pending tx " + err.message));;
        }).catch(err => console.log("Error in balanceOf() " + err.message));
    }).catch(err => console.log("Error in sell() " + err.message));
}

var initial_price = 0;
var transaction_complete = false;
var base = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174' //USDC

setInterval(function () {
    if (bought) {
        console.log('Monitoring...');
        process(base, Receive)
            .then(current_price => {
                if (initial_price == 0) {
                    initial_price = current_price;
                } else {
                    p_l = 100 * (current_price - initial_price) / initial_price
                    console.log("Initial Price: " + initial_price + " Current Price: " + current_price + " P/L: " + p_l);
                    if (current_price >= (initial_price + initial_price * take_profit)) {
                        console.log("Take Profit hit. Selling.")
                        sell();
                    } else if (current_price <= (initial_price - initial_price * stop_loss)) {
                        console.log("Stop Loss hit. Selling.")
                        sell();
                    }
                }
                if (transaction_complete) {
                    clearInterval();
                }
            }).catch(err => console.log("Error in monitoring. " + err.message));
    }
}, 2000);