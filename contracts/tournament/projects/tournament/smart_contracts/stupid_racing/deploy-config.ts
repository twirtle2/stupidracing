import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { StupidRacingTournamentFactory } from '../artifacts/stupid_racing/StupidRacingTournamentClient'

type DeployNetwork = 'mainnet' | 'testnet' | 'localnet'

const LOCALNET_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function parseNetwork(raw: string | undefined): DeployNetwork {
  const network = (raw || 'mainnet').toLowerCase()
  if (network === 'mainnet' || network === 'testnet' || network === 'localnet') {
    return network
  }
  throw new Error(`Invalid network: ${raw}`)
}

function defaultNodes(network: DeployNetwork) {
  if (network === 'mainnet') {
    return {
      algodServer: 'https://mainnet-api.algonode.cloud',
      indexerServer: 'https://mainnet-idx.algonode.cloud',
      token: '',
    }
  }

  if (network === 'testnet') {
    return {
      algodServer: 'https://testnet-api.algonode.cloud',
      indexerServer: 'https://testnet-idx.algonode.cloud',
      token: '',
    }
  }

  return {
    algodServer: 'http://localhost:4001',
    indexerServer: 'http://localhost:8980',
    token: LOCALNET_TOKEN,
  }
}

function defaultBeaconAppId(network: DeployNetwork): bigint {
  if (network === 'mainnet') {
    return 1615566206n
  }
  if (network === 'testnet') {
    return 600011887n
  }
  return 1n
}

function parseBracketSize(raw: string | undefined): bigint {
  const value = BigInt(raw || '8')
  const allowed = [2n, 4n, 8n, 16n, 32n, 64n]
  if (!allowed.includes(value)) {
    throw new Error('TOURNAMENT_BRACKET_SIZE must be one of 2, 4, 8, 16, 32, or 64')
  }
  return value
}

export async function deploy() {
  console.log('=== Deploying StupidRacingTournament ===')

  const network = parseNetwork(process.env.ALGORAND_NETWORK || process.env.NEXT_PUBLIC_NETWORK)
  const defaults = defaultNodes(network)

  const algorand = AlgorandClient.fromConfig({
    algodConfig: {
      server: process.env.ALGOD_SERVER || defaults.algodServer,
      port: Number(process.env.ALGOD_PORT || (network === 'localnet' ? 4001 : 443)),
      token: process.env.ALGOD_TOKEN || process.env.NEXT_PUBLIC_ALGOD_TOKEN || defaults.token,
    },
    indexerConfig: {
      server: process.env.INDEXER_SERVER || defaults.indexerServer,
      port: Number(process.env.INDEXER_PORT || (network === 'localnet' ? 8980 : 443)),
      token: process.env.INDEXER_TOKEN || process.env.NEXT_PUBLIC_INDEXER_TOKEN || defaults.token,
    },
  })
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  console.log(`Deploying using account: ${deployer.addr}`)

  const season = BigInt(process.env.TOURNAMENT_SEASON || '1')
  const bracketSize = parseBracketSize(process.env.TOURNAMENT_BRACKET_SIZE)
  const beaconAppId = BigInt(
    process.env.BEACON_APP_ID ||
      process.env.NEXT_PUBLIC_BEACON_APP_ID ||
      defaultBeaconAppId(network).toString(),
  )

  const factory = algorand.client.getTypedAppFactory(StupidRacingTournamentFactory, {
    defaultSender: deployer.addr,
  })

  const { appClient, result } = await factory.deploy({
    onUpdate: 'append',
    onSchemaBreak: 'append',
    createParams: {
      method: 'create',
      args: {
        season,
        bracketSize,
        beaconAppId,
      },
    },
  })

  if (['create', 'replace'].includes(result.operationPerformed)) {
    console.log('Funding app account for box storage...')
    await algorand.send.payment({
      amount: AlgoAmount.Algos(2),
      sender: deployer.addr,
      receiver: appClient.appAddress,
    })
  }

  if (result.operationPerformed === 'create') {
    console.log('Opening registration...')
    await appClient.send.openRegistration({
      args: {},
    })
  }

  const info = await appClient.send.getTournamentInfo({
    args: {},
  })

  console.log('Tournament Info:')
  console.log(`  Network: ${network}`)
  console.log(`  App ID: ${result.appId}`)
  console.log(`  App Address: ${result.appAddress}`)
  console.log(`  Season: ${info.return?.season}`)
  console.log(`  Bracket Size: ${info.return?.bracketSize}`)
  console.log(`  Registered: ${info.return?.registeredCount}`)
  console.log(`  State: ${info.return?.state}`)
  console.log(`  Beacon App ID: ${beaconAppId}`)
}
