export type StupidHorseAsset = {
  assetId: number;
  name: string;
  unitName: string;
  imageUrl: string;
};

export const STUPIDHORSE_CREATORS = [
  "GLOW7AKCAZXWQRPI6Q7OCVAO75H45AIYMTDEH3VNPETKYFXMNHAMQOVMS4",
  "STPD5WZ7DMF2RBBGROROWS6U2HNKC4SOHZXTFDTRIWHTXQ46TA7HU3A2SI",
  "2INYXKE3I465ED7HGFELKC2WDSA3R4V3A7BEZDJ7RWFNSFU2OQW44WZBAM",
];


export const STUPIDHORSE_ASSETS: StupidHorseAsset[] = [
  {
    assetId: 300549134,
    name: "STUPIDHORSE 001",
    unitName: "HORSE001",
    imageUrl: "https://ipfs.io/ipfs/bafkreif4lli2jm3wqit5z7y2exbh4wwxwy5q4laxshjnkhzf4ptgox3nla",
  },
  {
    assetId: 300565052,
    name: "STUPIDHORSE 002",
    unitName: "HORSE002",
    imageUrl: "https://ipfs.io/ipfs/bafkreifulo2mg666vr4vv5n2vygbxdnz632ifqwiubwlbnuinenqfb5q2q",
  },
  {
    assetId: 300569076,
    name: "STUPIDHORSE 003",
    unitName: "HORSE003",
    imageUrl: "https://ipfs.io/ipfs/bafkreieozddfna55i6pnv2jgqfm2xlfuj4tgbm3ywufdtppklvhqoglate",
  },
  {
    assetId: 300884781,
    name: "STUPIDHORSE 004",
    unitName: "HORSE004",
    imageUrl: "https://ipfs.io/ipfs/bafkreidalxn6xpxcppkar2t3axbstqydlgn6lgggdpc3fvgtcqtcmdibpi",
  },
  {
    assetId: 300886434,
    name: "STUPIDHORSE 005",
    unitName: "HORSE005",
    imageUrl: "https://ipfs.io/ipfs/bafkreigywfuuq6g4roaqi3awwzsabhmg7mfgvnwild7beczhcolc6s3ssm",
  },
  {
    assetId: 300887964,
    name: "STUPIDHORSE 006",
    unitName: "HORSE006",
    imageUrl: "https://ipfs.io/ipfs/bafkreie7eduhdbapig2rxak33i7mlaurr2nsbao3hvm2ubcl6srp2laidi",
  },
  {
    assetId: 300888716,
    name: "STUPIDHORSE 007",
    unitName: "HORSE007",
    imageUrl: "https://ipfs.io/ipfs/bafkreihpa4ykzmzdlxx4x6ccyjzy4hqdqa7ogytzlder5ujndrqywvhgka",
  },
  {
    assetId: 300891967,
    name: "STUPIDHORSE 008",
    unitName: "HORSE008",
    imageUrl: "https://ipfs.io/ipfs/bafkreifvcft6t26ashgdmpooat6ytd4ccimkgg64jhkosbegwshwx2dy4a",
  },
  {
    assetId: 300892820,
    name: "STUPIDHORSE 009",
    unitName: "HORSE009",
    imageUrl: "https://ipfs.io/ipfs/bafkreiclapm3e2uiaz6sg62yoejpvjycb2phzlhvgzzr6fy3g75jjogbz4",
  },
  {
    assetId: 300893496,
    name: "STUPIDHORSE 010",
    unitName: "HORSE010",
    imageUrl: "https://ipfs.io/ipfs/bafkreihnph5qcx6i5jycbf6qqzgbyb7sm7vv3okoa7n3nbfvbgkdqlbg5e",
  },
  {
    assetId: 300894097,
    name: "STUPIDHORSE 011",
    unitName: "HORSE011",
    imageUrl: "https://ipfs.io/ipfs/bafkreihoeiykf7tuxflm3cq3hmk2sqpoirofxc3rvgmzr6k2vg5pjxa7fq",
  },
  {
    assetId: 300894750,
    name: "STUPIDHORSE 012",
    unitName: "HORSE012",
    imageUrl: "https://ipfs.io/ipfs/bafkreif2jzqawwz6vvwms7jcdm5yktzsg3lwrbdildhcs3aa6ftqu4yphq",
  },
  {
    assetId: 300895449,
    name: "STUPIDHORSE 013",
    unitName: "HORSE013",
    imageUrl: "https://ipfs.io/ipfs/bafkreia2k6t2763i7rbcsb55dl3k3bjkwtkydqrd5vw5zcbrigi3tzfrrq",
  },
  {
    assetId: 300896136,
    name: "STUPIDHORSE 014",
    unitName: "HORSE014",
    imageUrl: "https://ipfs.io/ipfs/bafkreieuco7iukzxpvts4774upsswn3nk3pwvrzw2lvqudqe4qfocahtiu",
  },
  {
    assetId: 300897361,
    name: "STUPIDHORSE 015",
    unitName: "HORSE015",
    imageUrl: "https://ipfs.io/ipfs/bafkreidyohxaivqb4u5z7oul2tsvzelaqpk6kensk3jwtywvn2bqfcbt4m",
  },
];

export const STUPIDHORSE_ASSET_ID_SET = new Set(
  STUPIDHORSE_ASSETS.map((asset) => asset.assetId)
);

export const STUPIDHORSE_BY_ID = new Map(
  STUPIDHORSE_ASSETS.map((asset) => [asset.assetId, asset])
);
