import { type CaipNetwork } from '@reown/appkit-common';
import type { Chain } from '@wagmi/core/chains';
import type { Connector } from '@wagmi/core';
export declare function getWalletConnectCaipNetworks(connector?: Connector): Promise<{
    supportsAllNetworks: boolean;
    approvedCaipNetworkIds: (`eip155:${string}` | `eip155:${number}` | `solana:${string}` | `solana:${number}` | `polkadot:${string}` | `polkadot:${number}`)[];
}>;
export declare function getEmailCaipNetworks(): {
    supportsAllNetworks: boolean;
    approvedCaipNetworkIds: (`eip155:${string}` | `eip155:${number}` | `solana:${string}` | `solana:${number}` | `polkadot:${string}` | `polkadot:${number}`)[];
};
export declare function getTransport({ chain, projectId }: {
    chain: Chain;
    projectId: string;
}): import("viem").HttpTransport | import("viem").FallbackTransport<readonly [import("viem").HttpTransport, import("viem").HttpTransport]>;
export declare function requireCaipAddress(caipAddress: string): `0x${string}`;
export declare function convertToAppKitChains(caipNetworks: CaipNetwork[]): readonly [Chain, ...Chain[]];
