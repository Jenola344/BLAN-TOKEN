import { connect, disconnect, signMessage, getBalance, getEnsAvatar as wagmiGetEnsAvatar, getEnsName, watchAccount, watchConnectors, estimateGas as wagmiEstimateGas, writeContract as wagmiWriteContract, getAccount, getEnsAddress as wagmiGetEnsAddress, reconnect, switchChain, waitForTransactionReceipt, getConnections, switchAccount, injected, createConfig, getConnectors } from '@wagmi/core';
import { ChainController, ConstantsUtil as CoreConstantsUtil, StorageUtil } from '@reown/appkit-core';
import { prepareTransactionRequest, sendTransaction as wagmiSendTransaction } from '@wagmi/core';
import { mainnet } from 'viem/chains';
import { formatUnits, parseUnits } from 'viem';
import { ConstantsUtil, PresetsUtil, HelpersUtil } from '@reown/appkit-utils';
import { CaipNetworksUtil, isReownName, SafeLocalStorage, SafeLocalStorageKeys } from '@reown/appkit-common';
import { convertToAppKitChains, getEmailCaipNetworks, getTransport, getWalletConnectCaipNetworks, requireCaipAddress } from './utils/helpers.js';
import { W3mFrameHelpers, W3mFrameRpcConstants } from '@reown/appkit-wallet';
import { NetworkUtil } from '@reown/appkit-common';
import { normalize } from 'viem/ens';
import { ConstantsUtil as CommonConstantsUtil } from '@reown/appkit-common';
import { walletConnect } from './connectors/UniversalConnector.js';
import { coinbaseWallet } from '@wagmi/connectors';
import { authConnector } from './connectors/AuthConnector.js';
import { ProviderUtil } from '@reown/appkit/store';
const OPTIONAL_METHODS = [
    'eth_accounts',
    'eth_requestAccounts',
    'eth_sendRawTransaction',
    'eth_sign',
    'eth_signTransaction',
    'eth_signTypedData',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
    'eth_sendTransaction',
    'personal_sign',
    'wallet_switchEthereumChain',
    'wallet_addEthereumChain',
    'wallet_getPermissions',
    'wallet_requestPermissions',
    'wallet_registerOnboarding',
    'wallet_watchAsset',
    'wallet_scanQRCode'
];
export class WagmiAdapter {
    constructor(configParams) {
        this.appKit = undefined;
        this.options = undefined;
        this.chainNamespace = CommonConstantsUtil.CHAIN.EVM;
        this.defaultCaipNetwork = undefined;
        this.tokens = HelpersUtil.getCaipTokens(this.options?.tokens);
        this.siweControllerClient = this.options?.siweConfig;
        this.adapterType = 'wagmi';
        this.caipNetworks = configParams.networks.map(caipNetwork => ({
            ...caipNetwork,
            rpcUrl: CaipNetworksUtil.extendRpcUrlWithProjectId(caipNetwork.rpcUrl, configParams.projectId)
        }));
        this.wagmiChains = convertToAppKitChains(this.caipNetworks.filter(caipNetwork => caipNetwork.chainNamespace === CommonConstantsUtil.CHAIN.EVM));
        const transportsArr = this.wagmiChains.map(chain => [
            chain.id,
            getTransport({ chain, projectId: configParams.projectId })
        ]);
        const transports = Object.fromEntries(transportsArr);
        const connectors = [...(configParams.connectors ?? [])];
        this.wagmiConfig = createConfig({
            ...this.createConfigParams,
            chains: this.wagmiChains,
            transports,
            connectors: [...connectors, ...(this.createConfigParams?.connectors ?? [])]
        });
    }
    setCustomConnectors(options, appKit) {
        const customConnectors = [];
        if (options.enableWalletConnect !== false) {
            customConnectors.push(walletConnect(options, appKit));
        }
        if (options.enableInjected !== false) {
            customConnectors.push(injected({ shimDisconnect: true }));
        }
        if (options.enableCoinbase !== false) {
            customConnectors.push(coinbaseWallet({
                version: '4',
                appName: options.metadata?.name ?? 'Unknown',
                appLogoUrl: options.metadata?.icons[0] ?? 'Unknown',
                preference: options.coinbasePreference ?? 'all'
            }));
        }
        const emailEnabled = options.features?.email === undefined
            ? CoreConstantsUtil.DEFAULT_FEATURES.email
            : options.features?.email;
        const socialsEnabled = options.features?.socials
            ? options.features?.socials?.length > 0
            : CoreConstantsUtil.DEFAULT_FEATURES.socials;
        if (emailEnabled || socialsEnabled) {
            customConnectors.push(authConnector({
                chains: this.wagmiChains,
                options: { projectId: options.projectId }
            }));
        }
        customConnectors.forEach(connector => {
            const cnctr = this.wagmiConfig._internal.connectors.setup(connector);
            this.wagmiConfig._internal.connectors.setState(prev => [...prev, cnctr]);
        });
    }
    construct(appKit, options) {
        if (!options.projectId) {
            throw new Error('appkit:initialize - projectId is undefined');
        }
        this.appKit = appKit;
        this.options = options;
        this.caipNetworks = options.networks;
        this.defaultCaipNetwork = options.defaultNetwork || options.networks[0];
        this.tokens = HelpersUtil.getCaipTokens(options.tokens);
        this.setCustomConnectors(options, appKit);
        if (!this.wagmiConfig) {
            throw new Error('appkit:wagmiConfig - is undefined');
        }
        this.networkControllerClient = {
            switchCaipNetwork: async (caipNetwork) => {
                const chainId = Number(NetworkUtil.caipNetworkIdToNumber(caipNetwork?.id));
                if (chainId && this.wagmiConfig) {
                    await switchChain(this.wagmiConfig, { chainId });
                }
            },
            getApprovedCaipNetworksData: async () => {
                if (!this.wagmiConfig) {
                    throw new Error('networkControllerClient:getApprovedCaipNetworksData - wagmiConfig is undefined');
                }
                return new Promise(resolve => {
                    const connections = new Map(this.wagmiConfig.state.connections);
                    const connection = connections.get(this.wagmiConfig.state.current || '');
                    if (connection?.connector?.id === ConstantsUtil.AUTH_CONNECTOR_ID) {
                        resolve(getEmailCaipNetworks());
                    }
                    else if (connection?.connector?.id === ConstantsUtil.WALLET_CONNECT_CONNECTOR_ID) {
                        const connector = this.wagmiConfig.connectors.find(c => c.id === ConstantsUtil.WALLET_CONNECT_CONNECTOR_ID);
                        resolve(getWalletConnectCaipNetworks(connector));
                    }
                    resolve({ approvedCaipNetworkIds: undefined, supportsAllNetworks: true });
                });
            }
        };
        this.connectionControllerClient = {
            connectWalletConnect: async () => {
                if (!this.wagmiConfig) {
                    throw new Error('connectionControllerClient:getWalletConnectUri - wagmiConfig is undefined');
                }
                const connector = this.wagmiConfig.connectors.find(c => c.id === ConstantsUtil.WALLET_CONNECT_CONNECTOR_ID);
                if (!connector) {
                    throw new Error('connectionControllerClient:getWalletConnectUri - connector is undefined');
                }
                const provider = (await connector.getProvider());
                const siweParams = await this.options?.siweConfig?.getMessageParams?.();
                const isSiweEnabled = this.options?.siweConfig?.options?.enabled;
                const isProviderSupported = typeof provider?.authenticate === 'function';
                const isSiweParamsValid = siweParams && Object.keys(siweParams || {}).length > 0;
                const siweConfig = this.options?.siweConfig;
                if (isSiweEnabled && isProviderSupported && isSiweParamsValid && siweConfig) {
                    await connector.setRequestedChainsIds(siweParams.chains);
                    const { SIWEController, getDidChainId, getDidAddress } = await import('@reown/appkit-siwe');
                    const chains = this.caipNetworks
                        ?.filter(network => network.chainNamespace === 'eip155')
                        .map(chain => chain.id);
                    siweParams.chains = this.caipNetworks
                        ?.filter(network => network.chainNamespace === 'eip155')
                        .map(chain => chain.chainId);
                    const result = await provider.authenticate({
                        nonce: await siweConfig.getNonce(),
                        methods: [...OPTIONAL_METHODS],
                        ...siweParams,
                        chains
                    });
                    const signedCacao = result?.auths?.[0];
                    if (signedCacao) {
                        const { p, s } = signedCacao;
                        const cacaoChainId = getDidChainId(p.iss);
                        const address = getDidAddress(p.iss);
                        if (address && cacaoChainId) {
                            SIWEController.setSession({
                                address,
                                chainId: parseInt(cacaoChainId, 10)
                            });
                        }
                        try {
                            const message = provider.client.formatAuthMessage({
                                request: p,
                                iss: p.iss
                            });
                            await SIWEController.verifyMessage({
                                message,
                                signature: s.s,
                                cacao: signedCacao
                            });
                        }
                        catch (error) {
                            console.error('Error verifying message', error);
                            await provider.disconnect().catch(console.error);
                            await SIWEController.signOut().catch(console.error);
                            throw error;
                        }
                    }
                }
                const chainId = Number(NetworkUtil.caipNetworkIdToNumber(this.appKit?.getCaipNetwork()?.id));
                await connect(this.wagmiConfig, { connector, chainId });
            },
            connectExternal: async ({ id, provider, info }) => {
                if (!this.wagmiConfig) {
                    throw new Error('networkControllerClient:getApprovedCaipNetworksData - wagmiConfig is undefined');
                }
                const connector = this.wagmiConfig.connectors.find(c => c.id === id);
                if (!connector) {
                    throw new Error('connectionControllerClient:connectExternal - connector is undefined');
                }
                this.appKit?.setClientId(null);
                if (provider && info && connector.id === ConstantsUtil.EIP6963_CONNECTOR_ID) {
                    connector.setEip6963Wallet?.({ provider, info });
                }
                const chainId = Number(NetworkUtil.caipNetworkIdToNumber(this.appKit?.getCaipNetwork()?.id));
                await connect(this.wagmiConfig, { connector, chainId });
            },
            checkInstalled: ids => {
                const injectedConnector = this.appKit
                    ?.getConnectors()
                    .find((c) => c.type === 'INJECTED');
                if (!ids) {
                    return Boolean(window.ethereum);
                }
                if (injectedConnector) {
                    if (!window?.ethereum) {
                        return false;
                    }
                    return ids.some(id => Boolean(window.ethereum?.[String(id)]));
                }
                return false;
            },
            disconnect: async () => {
                await disconnect(this.wagmiConfig);
                if (this.options?.siweConfig?.options?.signOutOnDisconnect) {
                    const { SIWEController } = await import('@reown/appkit-siwe');
                    await SIWEController.signOut();
                }
                SafeLocalStorage.removeItem(SafeLocalStorageKeys.WALLET_ID);
                SafeLocalStorage.removeItem(SafeLocalStorageKeys.CONNECTED_CONNECTOR);
                SafeLocalStorage.removeItem(SafeLocalStorageKeys.WALLET_NAME);
                this.appKit?.setClientId(null);
                this.syncAccount({
                    address: undefined,
                    chainId: undefined,
                    connector: undefined,
                    addresses: undefined,
                    status: 'disconnected'
                });
                this.appKit?.resetAccount('solana');
            },
            signMessage: async (message) => {
                const caipAddress = this.appKit?.getCaipAddress() || '';
                const account = requireCaipAddress(caipAddress);
                return signMessage(this.wagmiConfig, { message, account });
            },
            estimateGas: async (args) => {
                if (args.chainNamespace && args.chainNamespace !== 'eip155') {
                    throw new Error(`Invalid chain namespace - Expected eip155, got ${args.chainNamespace}`);
                }
                try {
                    return await wagmiEstimateGas(this.wagmiConfig, {
                        account: args.address,
                        to: args.to,
                        data: args.data,
                        type: 'legacy'
                    });
                }
                catch (error) {
                    return BigInt(0);
                }
            },
            sendTransaction: async (data) => {
                if (data.chainNamespace && data.chainNamespace !== 'eip155') {
                    throw new Error(`Invalid chain namespace - Expected eip155, got ${data.chainNamespace}`);
                }
                const { chainId } = getAccount(this.wagmiConfig);
                const txParams = {
                    account: data.address,
                    to: data.to,
                    value: data.value,
                    gas: data.gas,
                    gasPrice: data.gasPrice,
                    data: data.data,
                    chainId,
                    type: 'legacy'
                };
                await prepareTransactionRequest(this.wagmiConfig, txParams);
                const tx = await wagmiSendTransaction(this.wagmiConfig, txParams);
                await waitForTransactionReceipt(this.wagmiConfig, { hash: tx, timeout: 25000 });
                return tx;
            },
            writeContract: async (data) => {
                const caipAddress = this.appKit?.getCaipAddress() || '';
                const account = requireCaipAddress(caipAddress);
                const chainId = Number(NetworkUtil.caipNetworkIdToNumber(this.appKit?.getCaipNetwork()?.id));
                const tx = await wagmiWriteContract(this.wagmiConfig, {
                    chain: this.wagmiChains?.[chainId],
                    chainId,
                    address: data.tokenAddress,
                    account,
                    abi: data.abi,
                    functionName: data.method,
                    args: [data.receiverAddress, data.tokenAmount]
                });
                return tx;
            },
            getEnsAddress: async (value) => {
                try {
                    if (!this.wagmiConfig) {
                        throw new Error('networkControllerClient:getApprovedCaipNetworksData - wagmiConfig is undefined');
                    }
                    const chainId = Number(NetworkUtil.caipNetworkIdToNumber(this.appKit?.getCaipNetwork()?.id));
                    let ensName = false;
                    let wcName = false;
                    if (isReownName(value)) {
                        wcName = (await this.appKit?.resolveReownName(value)) || false;
                    }
                    if (chainId === 1) {
                        ensName = await wagmiGetEnsAddress(this.wagmiConfig, {
                            name: normalize(value),
                            chainId
                        });
                    }
                    return ensName || wcName || false;
                }
                catch {
                    return false;
                }
            },
            getEnsAvatar: async (value) => {
                const chainId = Number(NetworkUtil.caipNetworkIdToNumber(this.appKit?.getCaipNetwork()?.id));
                if (chainId !== mainnet.id) {
                    return false;
                }
                const avatar = await wagmiGetEnsAvatar(this.wagmiConfig, {
                    name: normalize(value),
                    chainId
                });
                return avatar || false;
            },
            parseUnits,
            formatUnits
        };
        ChainController.state.chains.set(this.chainNamespace, {
            chainNamespace: this.chainNamespace,
            connectionControllerClient: this.connectionControllerClient,
            networkControllerClient: this.networkControllerClient,
            adapterType: this.adapterType,
            caipNetworks: this.caipNetworks
        });
        this.syncConnectors(this.wagmiConfig.connectors);
        this.syncAuthConnector(this.wagmiConfig?.connectors.find(c => c.id === ConstantsUtil.AUTH_CONNECTOR_ID));
        this.syncRequestedNetworks(this.caipNetworks);
        watchConnectors(this.wagmiConfig, {
            onChange: _connectors => {
                this.syncConnectors(_connectors);
                this.syncAuthConnector(_connectors.find(c => c.id === ConstantsUtil.AUTH_CONNECTOR_ID));
            }
        });
        watchAccount(this.wagmiConfig, {
            onChange: accountData => {
                this.syncAccount(accountData);
            }
        });
        this.appKit?.setEIP6963Enabled(options.enableEIP6963 !== false);
        this.appKit?.subscribeShouldUpdateToAddress((newAddress) => {
            if (newAddress) {
                const connections = getConnections(this.wagmiConfig);
                const connector = connections[0]?.connector;
                if (connector) {
                    switchAccount(this.wagmiConfig, {
                        connector
                    }).then(response => this.syncAccount({
                        address: newAddress,
                        isConnected: true,
                        addresses: response.accounts,
                        connector,
                        chainId: response.chainId,
                        status: 'connected'
                    }));
                }
            }
        });
    }
    subscribeState(callback) {
        return this.appKit?.subscribeState((state) => callback({
            ...state,
            selectedNetworkId: Number(NetworkUtil.caipNetworkIdToNumber(state.selectedNetworkId))
        }));
    }
    syncRequestedNetworks(caipNetworks) {
        const uniqueChainNamespaces = Array.from(new Set(caipNetworks.map(caipNetwork => caipNetwork.chainNamespace)));
        uniqueChainNamespaces
            .filter(c => Boolean(c))
            .forEach(chainNamespace => {
            this.appKit?.setRequestedCaipNetworks(caipNetworks.filter(caipNetwork => caipNetwork.chainNamespace === chainNamespace), chainNamespace);
        });
    }
    async syncAccount({ address, chainId, connector, addresses, status }) {
        const isConnected = ChainController.state.activeCaipAddress;
        if (status === 'disconnected' && !isConnected) {
            this.appKit?.resetAccount(this.chainNamespace);
            this.appKit?.resetWcConnection();
            this.appKit?.resetNetwork();
            this.appKit?.setAllAccounts([], this.chainNamespace);
            SafeLocalStorage.removeItem(SafeLocalStorageKeys.WALLET_ID);
            return;
        }
        if (this.wagmiConfig) {
            if (connector) {
                if (connector && connector.name === 'WalletConnect' && connector.getProvider && address) {
                    const currentChainId = chainId || Number(NetworkUtil.caipNetworkIdToNumber(this.appKit?.getCaipNetwork()?.id));
                    const provider = (await connector.getProvider());
                    const namespaces = provider?.session?.namespaces || {};
                    const namespaceKeys = namespaces ? Object.keys(namespaces) : [];
                    const preferredAccountType = this.appKit?.getPreferredAccountType();
                    namespaceKeys.forEach(key => {
                        const chainNamespace = key;
                        const caipAddress = namespaces?.[key]?.accounts[0];
                        ProviderUtil.setProvider(chainNamespace, provider);
                        ProviderUtil.setProviderId(chainNamespace, 'walletConnect');
                        this.appKit?.setPreferredAccountType(preferredAccountType, chainNamespace);
                        this.appKit?.setCaipAddress(caipAddress, chainNamespace);
                    });
                    if (this.appKit?.getCaipNetwork()?.chainNamespace !== 'solana') {
                        this.syncNetwork(address, currentChainId, true);
                        await Promise.all([
                            this.syncProfile(address, currentChainId),
                            this.syncBalance(address, currentChainId),
                            this.syncConnectedWalletInfo(connector),
                            this.appKit?.setApprovedCaipNetworksData(this.chainNamespace)
                        ]);
                    }
                }
                else if (status === 'connected' && address && chainId) {
                    const caipAddress = `eip155:${chainId}:${address}`;
                    this.syncNetwork(address, chainId, true);
                    this.appKit?.setCaipAddress(caipAddress, this.chainNamespace);
                    await Promise.all([
                        this.syncProfile(address, chainId),
                        this.syncBalance(address, chainId),
                        this.syncConnectedWalletInfo(connector),
                        this.appKit?.setApprovedCaipNetworksData(this.chainNamespace)
                    ]);
                    if (connector) {
                        this.syncConnectedWalletInfo(connector);
                    }
                    const isAuthConnector = connector?.id === ConstantsUtil.AUTH_CONNECTOR_ID;
                    if (!isAuthConnector && addresses?.length) {
                        this.appKit?.setAllAccounts(addresses.map(addr => ({ address: addr, type: 'eoa' })), this.chainNamespace);
                    }
                }
                else if (status === 'reconnecting') {
                    this.appKit?.setLoading(true);
                    const connectors = getConnectors(this.wagmiConfig);
                    const currentConnector = connectors.find(c => c.id === connector.id);
                    if (currentConnector) {
                        await reconnect(this.wagmiConfig, {
                            connectors: [currentConnector]
                        });
                        this.appKit?.setLoading(false);
                    }
                }
            }
        }
    }
    async syncNetwork(address, chainId, isConnected) {
        const chain = this.caipNetworks.find((c) => c.chainId === chainId);
        if (chain && chainId) {
            this.appKit?.setCaipNetwork({
                chainId: chain.chainId,
                id: chain.id,
                name: chain.name || '',
                imageId: PresetsUtil.NetworkImageIds[chain.chainId],
                imageUrl: this.options?.chainImages?.[chain.chainId],
                chainNamespace: this.chainNamespace,
                currency: chain?.currency || '',
                explorerUrl: chain?.explorerUrl || '',
                rpcUrl: chain?.rpcUrl || ''
            });
            if (isConnected && address && chainId) {
                const caipAddress = `eip155:${chainId}:${address}`;
                this.appKit?.setCaipAddress(caipAddress, this.chainNamespace);
                if (chain?.explorerUrl) {
                    const url = `${chain.explorerUrl}/address/${address}`;
                    this.appKit?.setAddressExplorerUrl(url, this.chainNamespace);
                }
                else {
                    this.appKit?.setAddressExplorerUrl(undefined, this.chainNamespace);
                }
                await this.syncBalance(address, chainId);
            }
        }
    }
    async syncReownName(address) {
        if (!this.appKit) {
            throw new Error('syncReownName - appKit is undefined');
        }
        try {
            const registeredWcNames = await this.appKit.getReownName(address);
            if (registeredWcNames[0]) {
                const wcName = registeredWcNames[0];
                this.appKit?.setProfileName(wcName.name, this.chainNamespace);
            }
            else {
                this.appKit?.setProfileName(null, this.chainNamespace);
            }
        }
        catch {
            this.appKit?.setProfileName(null, this.chainNamespace);
        }
    }
    async syncProfile(address, chainId) {
        if (!this.appKit) {
            throw new Error('syncProfile - appKit is undefined');
        }
        try {
            const { name, avatar } = await this.appKit.fetchIdentity({
                address
            });
            this.appKit?.setProfileName(name, this.chainNamespace);
            this.appKit?.setProfileImage(avatar, this.chainNamespace);
            if (!name) {
                await this.syncReownName(address);
            }
        }
        catch {
            if (chainId === mainnet.id) {
                const profileName = await getEnsName(this.wagmiConfig, { address, chainId });
                if (profileName) {
                    this.appKit?.setProfileName(profileName, this.chainNamespace);
                    const profileImage = await wagmiGetEnsAvatar(this.wagmiConfig, {
                        name: profileName,
                        chainId
                    });
                    if (profileImage) {
                        this.appKit?.setProfileImage(profileImage, this.chainNamespace);
                    }
                }
                else {
                    await this.syncReownName(address);
                    this.appKit?.setProfileImage(null, this.chainNamespace);
                }
            }
            else {
                await this.syncReownName(address);
                this.appKit?.setProfileImage(null, this.chainNamespace);
            }
        }
    }
    async syncBalance(address, chainId) {
        const chain = this.caipNetworks.find((c) => c.chainId === chainId);
        if (chain && this.wagmiConfig) {
            const balance = await getBalance(this.wagmiConfig, {
                address,
                chainId,
                token: this.options?.tokens?.[chain.id]?.address
            });
            this.appKit?.setBalance(balance.formatted, balance.symbol, this.chainNamespace);
            return;
        }
        this.appKit?.setBalance(undefined, undefined, this.chainNamespace);
    }
    async syncConnectedWalletInfo(connector) {
        if (!connector) {
            throw Error('syncConnectedWalletInfo - connector is undefined');
        }
        if (connector.id === ConstantsUtil.WALLET_CONNECT_CONNECTOR_ID && connector.getProvider) {
            const walletConnectProvider = (await connector.getProvider());
            if (walletConnectProvider.session) {
                this.appKit?.setConnectedWalletInfo({
                    ...walletConnectProvider.session.peer.metadata,
                    name: walletConnectProvider.session.peer.metadata.name,
                    icon: walletConnectProvider.session.peer.metadata.icons?.[0]
                }, this.chainNamespace);
            }
        }
        else {
            const wagmiConnector = this.appKit?.getConnectors().find(c => c.id === connector.id);
            this.appKit?.setConnectedWalletInfo({
                name: connector.name,
                icon: connector.icon || this.appKit.getConnectorImage(wagmiConnector)
            }, this.chainNamespace);
        }
    }
    syncConnectors(_connectors) {
        const connectors = _connectors.map(connector => ({ ...connector, chain: this.chainNamespace }));
        const uniqueIds = new Set();
        const filteredConnectors = connectors.filter(item => {
            const isDuplicate = uniqueIds.has(item.id);
            uniqueIds.add(item.id);
            return !isDuplicate;
        });
        const w3mConnectors = [];
        filteredConnectors.forEach(({ id, name, type, icon }) => {
            const shouldSkip = ConstantsUtil.AUTH_CONNECTOR_ID === id;
            if (!shouldSkip) {
                w3mConnectors.push({
                    id,
                    explorerId: PresetsUtil.ConnectorExplorerIds[id],
                    imageUrl: this.options?.connectorImages?.[id] ?? icon,
                    name: PresetsUtil.ConnectorNamesMap[id] ?? name,
                    imageId: PresetsUtil.ConnectorImageIds[id],
                    type: PresetsUtil.ConnectorTypesMap[type] ?? 'EXTERNAL',
                    info: {
                        rdns: id
                    },
                    chain: this.chainNamespace
                });
            }
        });
        this.appKit?.setConnectors(w3mConnectors);
    }
    async syncAuthConnector(_authConnector) {
        const connector = _authConnector;
        if (connector) {
            const provider = await connector.getProvider();
            this.appKit?.addConnector({
                id: ConstantsUtil.AUTH_CONNECTOR_ID,
                type: 'AUTH',
                name: 'w3mAuth',
                provider,
                chain: this.chainNamespace
            });
            this.initAuthConnectorListeners(_authConnector);
        }
    }
    async initAuthConnectorListeners(_authConnector) {
        if (_authConnector) {
            await this.listenAuthConnector(_authConnector);
            await this.listenModal(_authConnector);
        }
    }
    async listenAuthConnector(connector, bypassWindowCheck = false) {
        if (bypassWindowCheck || (typeof window !== 'undefined' && connector)) {
            this.appKit?.setLoading(true);
            const provider = (await connector.getProvider());
            const isLoginEmailUsed = provider.getLoginEmailUsed();
            this.appKit?.setLoading(isLoginEmailUsed);
            provider.onRpcRequest((request) => {
                if (W3mFrameHelpers.checkIfRequestExists(request)) {
                    if (!W3mFrameHelpers.checkIfRequestIsSafe(request)) {
                        this.appKit?.handleUnsafeRPCRequest();
                    }
                }
                else {
                    this.appKit?.open();
                    console.error(W3mFrameRpcConstants.RPC_METHOD_NOT_ALLOWED_MESSAGE, {
                        method: request.method
                    });
                    setTimeout(() => {
                        this.appKit?.showErrorMessage(W3mFrameRpcConstants.RPC_METHOD_NOT_ALLOWED_UI_MESSAGE);
                    }, 300);
                    provider.rejectRpcRequests();
                }
            });
            provider.onRpcError(() => {
                const isModalOpen = this.appKit?.isOpen();
                if (isModalOpen) {
                    if (this.appKit?.isTransactionStackEmpty()) {
                        this.appKit?.close();
                    }
                    else {
                        this.appKit?.popTransactionStack(true);
                    }
                }
            });
            provider.onRpcSuccess((_, request) => {
                const isSafeRequest = W3mFrameHelpers.checkIfRequestIsSafe(request);
                if (isSafeRequest) {
                    return;
                }
                if (this.appKit?.isTransactionStackEmpty()) {
                    this.appKit?.close();
                }
                else {
                    this.appKit?.popTransactionStack();
                }
            });
            provider.onNotConnected(() => {
                const isConnected = this.appKit?.getIsConnectedState();
                const connectedConnector = SafeLocalStorage.getItem(SafeLocalStorageKeys.CONNECTED_CONNECTOR);
                const isConnectedWithAuth = connectedConnector === 'AUTH';
                if (!isConnected && isConnectedWithAuth) {
                    this.appKit?.setCaipAddress(undefined, this.chainNamespace);
                    this.appKit?.setLoading(false);
                }
            });
            provider.onIsConnected(() => {
                provider.connect();
            });
            provider.onConnect(user => {
                const caipAddress = `eip155:${user.chainId}:${user.address}`;
                this.appKit?.setCaipAddress(caipAddress, this.chainNamespace);
                this.appKit?.setSmartAccountDeployed(Boolean(user.smartAccountDeployed), this.chainNamespace);
                this.appKit?.setPreferredAccountType(user.preferredAccountType, this.chainNamespace);
                this.appKit?.setAllAccounts(user.accounts || [
                    {
                        address: user.address,
                        type: (user.preferredAccountType || 'eoa')
                    }
                ], this.chainNamespace);
                StorageUtil.setConnectedConnector('AUTH');
                this.appKit?.setLoading(false);
            });
            provider.onGetSmartAccountEnabledNetworks(networks => {
                this.appKit?.setSmartAccountEnabledNetworks(networks, this.chainNamespace);
            });
            provider.onSetPreferredAccount(({ address, type }) => {
                if (!address) {
                    return;
                }
                this.appKit?.setPreferredAccountType(type, this.chainNamespace);
                if (this.wagmiConfig) {
                    reconnect(this.wagmiConfig, { connectors: [connector] });
                }
            });
        }
    }
    async listenModal(connector) {
        const provider = (await connector.getProvider());
        this.subscribeState(val => {
            if (!val.open) {
                provider.rejectRpcRequests();
            }
        });
    }
}
//# sourceMappingURL=client.js.map