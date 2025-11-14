import type { ChainAdapter } from '@reown/appkit-core';
import type { Chain } from '@wagmi/core/chains';
import type { Config, CreateConfigParameters } from '@wagmi/core';
import type { ConnectionControllerClient, NetworkControllerClient, PublicStateControllerState } from '@reown/appkit-core';
import type { AppKitOptions } from '@reown/appkit';
import type { CaipNetwork, ChainNamespace, AdapterType } from '@reown/appkit-common';
import type { AppKit } from '@reown/appkit';
export interface AdapterOptions<C extends Config> extends Pick<AppKitOptions, 'siweConfig' | 'enableEIP6963'> {
    wagmiConfig: C;
    defaultNetwork?: Chain;
}
interface AppKitState extends PublicStateControllerState {
    selectedNetworkId: number | undefined;
}
export declare class WagmiAdapter implements ChainAdapter {
    private appKit;
    private createConfigParams?;
    options: AppKitOptions | undefined;
    chainNamespace: ChainNamespace;
    caipNetworks: CaipNetwork[];
    wagmiChains: readonly [Chain, ...Chain[]];
    wagmiConfig: AdapterOptions<Config>['wagmiConfig'];
    networkControllerClient?: NetworkControllerClient;
    connectionControllerClient?: ConnectionControllerClient;
    defaultCaipNetwork: CaipNetwork | undefined;
    tokens: import("@reown/appkit-core").Tokens | undefined;
    siweControllerClient: import("@reown/appkit-siwe").AppKitSIWEClient | undefined;
    adapterType: AdapterType;
    constructor(configParams: Partial<CreateConfigParameters> & {
        networks: CaipNetwork[];
        projectId: string;
    });
    private setCustomConnectors;
    construct(appKit: AppKit, options: AppKitOptions): void;
    subscribeState(callback: (state: AppKitState) => void): (() => void) | undefined;
    private syncRequestedNetworks;
    private syncAccount;
    private syncNetwork;
    private syncReownName;
    private syncProfile;
    private syncBalance;
    private syncConnectedWalletInfo;
    private syncConnectors;
    private syncAuthConnector;
    private initAuthConnectorListeners;
    private listenAuthConnector;
    private listenModal;
}
export {};
