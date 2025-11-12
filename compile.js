
const path = require('path');
const fs = require('fs');
const solc = require('solc');

const contractPath = path.resolve(__dirname, 'BLAN_Token_flat.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
    language: 'Solidity',
    sources: {
        'BLAN_Token_flat.sol': {
            content: source,
        },
    },
    settings: {
        outputSelection: {
            '*': {
                '*': ['abi'], 
            },
        },
    },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
    console.error('Compilation failed:');
    let hasFatalError = false;
    output.errors.forEach((err) => {
        console.error(err.formattedMessage);
        if (err.severity === 'error') {
            hasFatalError = true;
        }
    });
    if (hasFatalError) {
      process.exit(1);
    }
}

const contractName = 'BLANToken';
const contractFileName = 'BLAN_Token_flat.sol';
const contract = output.contracts[contractFileName][contractName];

if (!contract || !contract.abi) {
    console.error('ABI not found for contract ' + contractName);
    process.exit(1);
}

fs.writeFileSync(path.resolve(__dirname, 'frontend', 'abi.json'), JSON.stringify(contract.abi, null, 2));

console.log('ABI generated and saved to frontend/abi.json');
