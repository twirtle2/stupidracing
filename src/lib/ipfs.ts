export function resolveIpfsUrl(url?: string) {
    if (!url) return "";
    if (url.startsWith("ipfs://")) {
        return url.replace("ipfs://", "https://ipfs.algonode.xyz/ipfs/");
    }
    if (url.startsWith("https://ipfs.io/ipfs/")) {
        return url.replace("https://ipfs.io/ipfs/", "https://ipfs.algonode.xyz/ipfs/");
    }
    return url;
}
