const fs = require('fs-extra');
const solc = require('solc');

function findImports(path) {
    if (path.startsWith('@openzeppelin/')) {
        return { contents: fs.readFileSync(require.resolve(path), 'utf8') };
    } else {
        return { error: 'File not found' };
    }
}

function compileSols(contractFolder, contractFile) {
    const contractPath = `${contractFolder}/${contractFile}`;
    const contractSource = fs.readFileSync(contractPath, 'utf8');

    const sources = {
        [contractFile]: {
            content: contractSource,
        },
    };

    const input = {
        language: 'Solidity',
        sources,
        settings: {
            outputSelection: {
                '*': {
                    '*': ['abi'],
                },
            },
        },
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

    if (output.errors) {
        console.error('Compilation errors:');
        output.errors.forEach((err) => console.error(err.formattedMessage));
        return null;
    }

    const contractName = contractFile.replace('.sol', '');
    const compiledContract = output.contracts[contractFile][contractName];
    fs.writeFileSync(`frontend/abi.json`, JSON.stringify(compiledContract.abi, null, 4));
    return compiledContract.abi;
}


if (require.main === module) {
    compileSols('.', 'BLAN Token.sol');
}