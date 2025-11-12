
const connectButton = document.getElementById('connectButton');
const mineButton = document.getElementById('mineButton');
const userInfo = document.getElementById('userInfo');
const userAddress = document.getElementById('userAddress');
const userBalance = document.getElementById('userBalance');
const miningStatus = document.getElementById('miningStatus');

const contractAddress = 'YOUR_CONTRACT_ADDRESS'; // Replace with your contract address
const contractABI = [
    // Add the ABI of your contract here
];

let provider;
let signer;
let contract;

connectButton.addEventListener('click', async () => {
    if (typeof window.ethereum !== 'undefined') {
        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
            contract = new ethers.Contract(contractAddress, contractABI, signer);

            const address = await signer.getAddress();
            const balance = await contract.balanceOf(address);

            userAddress.innerText = address;
            userBalance.innerText = ethers.utils.formatUnits(balance, 18);

            userInfo.style.display = 'block';
            mineButton.style.display = 'block';
            connectButton.style.display = 'none';
        } catch (error) {
            console.error('Error connecting wallet:', error);
        }
    } else {
        alert('Please install MetaMask!');
    }
});

mineButton.addEventListener('click', async () => {
    try {
        miningStatus.innerText = 'Mining...';
        const tx = await contract.emergencyMint(await signer.getAddress(), ethers.utils.parseUnits('1', 18)); // Mint 1 BLAN
        await tx.wait();

        const balance = await contract.balanceOf(await signer.getAddress());
        userBalance.innerText = ethers.utils.formatUnits(balance, 18);
        miningStatus.innerText = 'Mining successful!';
    } catch (error) {
        console.error('Error mining tokens:', error);
        miningStatus.innerText = 'Mining failed.';
    }
});
