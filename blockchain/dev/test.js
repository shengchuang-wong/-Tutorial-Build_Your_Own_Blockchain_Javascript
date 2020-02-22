const Blockchain = require('./blockchain');

const geekcoin = new Blockchain();

const previousBlockHash = 'IGSIEGUENWS';
const currentBlockData = [
    {
        amount: 10,
        sender: 'Ally',
        recipient: 'Adam'
    },
    {
        amount: 30,
        sender: 'Ally',
        recipient: 'Sally'
    },
    {
        amount: 95,
        sender: 'Windy',
        recipient: 'Sam'
    }
];

const nonce = 100;

console.log(geekcoin.hashBlock(previousBlockHash, currentBlockData, nonce));

console.log(geekcoin);