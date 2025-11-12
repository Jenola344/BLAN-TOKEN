
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
                '*': ['abi'], // Only need ABI
            },
        },
    },
};

function findImports(importPath) {
    // Check for direct imports from node_modules
    const nodeModulesPath = path.resolve(__dirname, 'node_modules', importPath);
    if (fs.existsSync(nodeModulesPath)) {
        return { contents: fs.readFileSync(nodeModulesPath, 'utf8') };
    }
    return { error: 'File not found' };
}

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

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
const contractFileName = 'BLAN Token.sol';
const contract = output.contracts[contractFileName][contractName];

if (!contract || !contract.abi) {
    console.error('ABI not found for contract ' + contractName);
    process.exit(1);
}

fs.writeFileSync(path.resolve(__dirname, 'frontend', 'abi.json'), JSON.stringify(contract.abi, null, 2));

console.log('ABI generated and saved to frontend/abi.json');
