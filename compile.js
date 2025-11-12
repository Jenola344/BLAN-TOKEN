
const path = require('path');
const fs = require('fs');
const solc = require('solc');

const contractPath = path.resolve(__dirname, 'BLAN Token.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
    language: 'Solidity',
    sources: {
        'BLAN Token.sol': {
            content: source,
        },
    },
    settings: {
        outputSelection: {
            '*': {
                '*': ['*'],
            },
        },
    },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

const contract = output.contracts['BLAN Token.sol']['BLANToken'];

fs.writeFileSync(path.resolve(__dirname, 'frontend', 'abi.json'), JSON.stringify(contract.abi));

console.log('ABI generated and saved to frontend/abi.json');
