const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Blockchain = require('./blockchain');
const uuid = require('uuid/v1');
const port = process.argv[2];
const rp = require('request-promise');

const nodeAddress = uuid().split('-').join('');

const geekcoin = new Blockchain();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/blockchain', function (req, res) {
    res.send(geekcoin);
});

app.post('/transaction', function (req, res) {
    const newTransaction = req.body;
    const blockIndex = geekcoin.addTransactionToPendingTransactions(newTransaction);
    res.json({ note: 'Transaction will be added in block ' + blockIndex + '.' })
});

app.get('/mine', function (req, res) {

    const lastBlock = geekcoin.getLastBlock();
    const previousBlockHash = lastBlock['hash'];
    const currentBlockData = {
        transactions: geekcoin.pendingTransactions,
        index: lastBlock['index'] + 1
    }

    const nonce = geekcoin.proofOfWork(previousBlockHash, currentBlockData);
    const blockHash = geekcoin.hashBlock(previousBlockHash, currentBlockData, nonce);

    const newBlock = geekcoin.createNewBlock(nonce, previousBlockHash, blockHash);

    const requestPromises = [];
    geekcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/receive-new-block',
            method: 'POST',
            body: { newBlock: newBlock },
            json: true
        };

        requestPromises.push(rp(requestOptions));
    });

    Promise.resolve(requestPromises)
    .then(data => {
        const requestOptions = {
            uri: geekcoin.currentNodeUrl + '/transaction/broadcast',
            method: 'POST',
            body: {
                amount: 12.5,
                sender: '00',
                recipient: nodeAddress
            },
            json: true
        };

        return rp(requestOptions)
    })
    .then(data => {
        res.json({
            note: 'New block mined successfully',
            block: newBlock
        })
    })

});

app.post('/receive-new-block', function(req, res) {
    const newBlock = req.body.newBlock;
    const lastBlock = geekcoin.getLastBlock();
    const correctHash = lastBlock.hash === newBlock.previousBlockHash;
    const correctIndex = lastBlock['index'] + 1 === newBlock['index'];

    if(correctHash && correctIndex) {
        geekcoin.chain.push(newBlock);
        geekcoin.pendingTransactions = [];
        res.json({
            note: 'New block received and accepted',
            newBlock: newBlock
        });
    } else {
        res.json({ note: 'New block rejected.', newBlock: newBlock })
    }
});

// register a node and broadcast it to the network
app.post('/register-and-broadcast-node', function (req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    if (!geekcoin.networkNodes.includes(newNodeUrl)) {
        geekcoin.networkNodes.push(newNodeUrl);

        const regNodesPromises = [];

        geekcoin.networkNodes.forEach(networkNode => {
            const requestOptions = {
                uri: networkNode + '/register-node',
                method: 'POST',
                body: { newNodeUrl: newNodeUrl },
                json: true
            };

            regNodesPromises.push(rp(requestOptions));
        })


        Promise.resolve(regNodesPromises)
            .then(data => {
                const bulkRegisterOptions = {
                    uri: newNodeUrl + '/register-nodes-bulk',
                    method: 'POST',
                    body: { allNetworkNodes: [...geekcoin.networkNodes, geekcoin.currentNodeUrl] },
                    json: true
                }
                return rp(bulkRegisterOptions);
            })
            .then(data => {
                res.json({ note: 'New node registered with network successfully.' })
            })

    }
});

// register a node with the network
app.post('/register-node', function (req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    if (!geekcoin.networkNodes.includes(newNodeUrl) && geekcoin.currentNodeUrl !== newNodeUrl) {
        geekcoin.networkNodes.push(newNodeUrl);
        res.json({ note: 'New node registered successfully.' })
    }
});

// register multiple nodes at once
app.post('/register-nodes-bulk', function (req, res) {
    const allNetworkNodes = req.body.allNetworkNodes;
    allNetworkNodes.forEach(networkNodeUrl => {
        if(!geekcoin.networkNodes.includes(networkNodeUrl) && networkNodeUrl !== geekcoin.currentNodeUrl) {
            geekcoin.networkNodes.push(networkNodeUrl);
        }
    });

    res.json({ note: 'Bulk registration successful.' })
});

app.post('/transaction/broadcast', function(req, res) {
    const newTransaction = geekcoin.createNewTransaction(req.body.amount, req.body.sender, req.body.recipient);
    geekcoin.addTransactionToPendingTransactions(newTransaction);

    const requestPromises = [];
    geekcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/transaction',
            method: 'POST',
            body: newTransaction,
            json: true
        };

        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
    .then(data => {
        res.json({ note: 'Transaction created and broadcast successfully.' })
    });
});

app.get('/consensus', function(req, res) {
    
    const requestPromises = [];
    geekcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/blockchain',
            method: 'GET',
            json: true
        };

        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
    .then(blockchains => {
        
        const currentChainLength = geekcoin.chain.length;
        let maxChainLength = currentChainLength;
        let newLongestChain = null;
        let newPendingTransactions = null;
        
        blockchains.forEach(blockchain => {
            if(blockchain.chain.length > maxChainLength) {
                maxChainLength = blockchain.chain.length;
                newLongestChain = blockchain.chain;
                newPendingTransactions = blockchain.pendingTransactions;
            }
        });

        if(!newLongestChain || (newLongestChain && !geekcoin.chainIsValid(newLongestChain))) {
            res.json({
                note: 'Current chain has not been replaced.',
                chain: geekcoin.chain
            })
        } else if (newLongestChain && geekcoin.chainIsValid(newLongestChain)) {
            geekcoin.chain = newLongestChain;
            geekcoin.pendingTransactions = newPendingTransactions;
            res.json({
                note: 'This chain has been replaced.',
                chain: geekcoin.chain
            })
        }

    })
});

app.get('/block/:blockHash', function(req, res) {
    const blockHash = req.params.blockHash;
    const correctBlock = geekcoin.getBlock(blockHash);

    res.json({
        block: correctBlock
    });
});

app.get('/transaction/:transactionId', function(req, res) {
    const transactionId = req.params.transactionId;
    const transactionData = geekcoin.getTransaction(transactionId);

    res.json({
        transaction: transactionData.transaction,
        block: transactionData.block
    })
});

app.get('/address/:address', function(req, res) {
    const address = req.params.address;
    const addressData = geekcoin.getAddressData(address);

    res.json({
        addressData: addressData
    });
});

app.get('/block-explorer', function(req, res) {
    res.sendFile('./block-explorer/index.html', { root: __dirname });
});

app.listen(port, function () {
    console.log(`listening on port ${port}`);
});