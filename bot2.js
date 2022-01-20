const ethers = require('ethers');
const {
    routers,
    factories,
    ABIs
} = require('./addresses/ethereum');
const config = require('./config');

const {
    abiFetcher
} = require('./helpers/scan');

//*************
//ENTER YOUR DETAILS!


//1. Snipe details

const Spend = '' // Token to use as base, e.g WMATIC
const Receive = '' // Token to Buy


const amountToSpend = 1; //Amount of base to spend
const limitPrice = 3; //Limit price
var take_profit = 10; //In Percentage
var stop_loss = 10; //In Percentage
var gas = 30;
var gasLimit = 400000

//2. Wallet
const Seed = '' // Add wallet seed phrase here
const recipientAddress = '' // Wallet Address

//3. Optional settings
const Slippage = 0


//////Done. Do NOT change code after this!

// const amountIn = ethers.utils.parseUnits(amountToSpend.toString(), 'ether')

const routerAddress = routers.quickSwap;
const factoryAddress = factories.quickSwap;

const WSS = config.wssEndpoint;

// const SnipeID = (Receive.toLowerCase()).substring(2) //e.g. "f2c96e402c9199682d5ded26d3771c6b192c01af"

var bought = false;
var order = false;

take_profit = take_profit / 100;
stop_loss = stop_loss / 100;

var gasPrice = ethers.utils.parseUnits(`${gas}`, 'gwei');

// const MethodID = "0xf305d719"
// const MethodID2 = "0xe8e33700"

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

const factory = new ethers.Contract(
    factoryAddress,
    [
        'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
        'function getPair(address tokenA, address tokenB) external view returns (address pair)'
    ],
    account
);

const spend_token = new ethers.Contract(
    Spend,
    [
        'function approve(address spender, uint amount) public returns(bool)',
        'function decimals() external pure returns (uint8)'
    ],
    account
);


const approval = async () => {

    const decimals = await spend_token.decimals();

    const tx = await spend_token.approve(
        routerAddress,
        ethers.utils.parseUnits(`${amountToSpend}`, decimals), {
            gasPrice: gasPrice,
            gasLimit: gasLimit
        }
    );

    console.log(`After Approve`);
    const receipt = await tx.wait();
    console.log('Transaction receipt Received');

    return decimals;
    // console.log(receipt);
}

async function getPair(token0, token1) {
    return await factory.getPair(token0, token1);
}

getPair(Spend, Receive).then(pairAddress => {

    console.log(`Pair Detected: ${pairAddress}`)

    const pairContract = new ethers.Contract(
        pairAddress,
        [
            'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
            'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
        ],
        account
    );

    approval().then(decimals => {


        console.log(`Connecting to the blockchain`);
        console.log(`Starting to scan the network for a matching transaction based on the config entered`);
        console.log(`As soon as a matching transaction has been found, it will be displayed here`);
        try {
            pairContract.on('Swap', async () => {

                const pairData = await pairContract.getReserves();
                const tokenOutReserve = ethers.utils.formatUnits(pairData[0], 18)
                const tokenInReserve = ethers.utils.formatUnits(pairData[1], 18)
                const ltp = (Number(tokenInReserve) / Number(tokenOutReserve)) * Math.pow(10, 18 - decimals)

                if (ltp > limitPrice) {
                    console.log(`Last Price: ${ltp} not buying`)
                    return
                }


                console.log(`Last Price: ${ltp} buying`)
                var amountOutMin = 0;
                var amountInParsed = ethers.utils.parseUnits(`${amountToSpend}`, decimals);
                if (parseInt(Slippage) !== 0) {
                    const amounts = await router.getAmountsOut(amountInParsed, [Spend, Receive]);
                    //Our execution price will be a bit different, we need some flexibility
                    amountOutMin = amounts[1].sub(amounts[1].div(Slippage))
                }

                console.log(`
                            Buying new token
                            =================
                            tokenIn: ${amountInParsed} ${Spend}
                            tokenOut: ${amountOutMin} ${Receive}`);

                console.log(`Matching liquidity add transaction found!`);
                router.swapExactTokensForTokens(
                    amountInParsed,
                    amountOutMin,
                    [Spend, Receive],
                    recipientAddress,
                    Math.floor(Date.now() / 1000) + 60 * 10, {
                        gasLimit: 400000,
                        gasPrice: gasPrice
                    }
                ).then(tx => {
                    console.log(tx);
                    console.log('Ctrl+click the link below to check if tokens were bought');
                    console.log('https://polygonscan.com/tx/' + tx['hash']);
                    bought = true
                }).catch(err => console.log("Error in buy swapExactTokensForTokens " + err.message));

                order = true;

                setTimeout(function () {
                    console.log(`Attempting to place a buy order...`);
                }, 500);

                setTimeout(function () {
                    console.log('Ctrl+click the link below to access wallet.');
                    console.log('https://polygonscan.com/address/' + recipientAddress);
                    console.log("Order placed!");
                }, 1000);

                if (order) {
                    pairContract.removeAllListeners()
                    return
                }

            })
        } catch (err) {
            console.log("Error " + err.message);
        }
    })
})


const newRouter = new ethers.Contract(
    Receive,
    [
        'function approve(address spender, uint amount) public returns(bool)',
        'function decimals() external pure returns (uint8)',
        'function balanceOf(address owner) external view returns (uint)'
    ],
    account
);


async function getPrice(pairAddress, decimals) {
    const pairContract = new ethers.Contract(
        pairAddress,
        [
            'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
        ],
        account
    );
    const pairData = await pairContract.getReserves();
    const tokenOutReserve = ethers.utils.formatUnits(pairData[0], 18);
    const tokenInReserve = ethers.utils.formatUnits(pairData[1], 18);
    const ltp = (Number(tokenInReserve) / Number(tokenOutReserve)) * Math.pow(10, 18 - decimals);
    return ltp;
}

async function process(base, token) {
    var decimals = await newRouter.decimals();
    pairAddress = await getPair(token, base)
    return await getPrice(pairAddress, decimals);
}

const sell = async () => {

    if (transaction_complete) {
        return;
    }

    newRouter.decimals().then(decimals => {
        newRouter.balanceOf(recipientAddress).then(balance => {
            var amountIn = ethers.utils.parseUnits(balance.toString(), decimals);


            const approve = newRouter.approve(
                routerAddress,
                ethers.utils.parseUnits(`${amountIn}`, decimals), {
                    gasPrice: gasPrice,
                    gasLimit: gasLimit
                }
            );

            approve().then(x=>{

                var amountOutMin = 0;
                if (parseInt(Slippage) !== 0) {
                    const getAmounts = router.getAmountsOut(amountIn, [Receive, Spend]).then(amounts => {
                        amountOutMin = amounts[1].sub(amounts[1].div(Slippage))
                    })
                    getAmounts();
                }
                console.log(`
                        Selling back token
                        =================
                        tokenIn: ${amountIn} ${Receive}
                        tokenOut: ${amountOutMin} ${Spend}`);

                router.swapExactTokensForTokens(
                    amountIn,
                    amountOutMin,
                    [Receive, Spend],
                    recipientAddress,
                    Date.now() + 1000 * 60 * 10, {
                        gasLimit: gasLimit,
                        gasPrice: gasPrice
                    }
                ).then(tx => {
                    console.log(tx);
                    console.log('Ctrl+click the link below to check if tokens were bought');
                    console.log('https://polygonscan.com/tx/' + tx['hash']);
                }).catch(err => console.log("Error in buy swapExactTokensForTokens " + err.message));

                setTimeout(function () {
                    console.log(`Attempting to place a sell order...`);
                }, 500);
                setTimeout(function () {
                    console.log('https://polygonscan.com/address/' + recipientAddress);
                }, 700);
                setTimeout(function () {
                    console.log("Order placed! Shutting down bot.");
                    transaction_complete = true;
                }, 1000);

                return;
            })
        })
    }).catch(err => console.log("Error in balanceOf() " + err.message));
}

var initial_price = 0;
var transaction_complete = false;
var base = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174' //USDC

setInterval(function () {
    if (bought) {
        console.log('Monitoring...');
        process(base, Receive).then(current_price => {
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
