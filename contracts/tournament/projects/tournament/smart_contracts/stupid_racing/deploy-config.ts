import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { StupidRacingTournamentFactory } from '../artifacts/stupid_racing/StupidRacingTournamentClient'

export async function deploy() {
    console.log('=== Deploying StupidRacingTournament ===')

    // Use explicit configuration instead of fromEnvironment for more control
    const algorand = AlgorandClient.fromConfig({
        algodConfig: {
            server: process.env.ALGOD_SERVER || 'https://testnet-api.algonode.cloud',
            port: Number(process.env.ALGOD_PORT || 443),
            token: process.env.ALGOD_TOKEN || '',
        },
        indexerConfig: {
            server: process.env.INDEXER_SERVER || 'https://testnet-idx.algonode.cloud',
            port: Number(process.env.INDEXER_PORT || 443),
            token: process.env.INDEXER_TOKEN || '',
        },
    })
    const deployer = await algorand.account.fromEnvironment('DEPLOYER')

    console.log(`Deploying using account: ${deployer.addr}`)

    const factory = algorand.client.getTypedAppFactory(StupidRacingTournamentFactory, {
        defaultSender: deployer.addr,
    })

    // Prepare creation arguments - must be passed during deployment for "onCreate" method
    const { appClient, result } = await factory.deploy({
        onUpdate: 'append',
        onSchemaBreak: 'append',
        createParams: {
            method: 'create',
            args: {
                season: 1n,
                bracketSize: 2n,
                beaconAppId: 600011887n, // TestNet Randomness Beacon
            },
        }
    })

    // Fund the app account for BoxMap storage
    if (['create', 'replace'].includes(result.operationPerformed)) {
        console.log('Funding app account for box storage...')
        await algorand.send.payment({
            amount: AlgoAmount.Algos(2), // 2 ALGO for box storage MBR
            sender: deployer.addr,
            receiver: appClient.appAddress,
        })
    }

    // Initialize the tournament if just created
    if (result.operationPerformed === 'create') {
        console.log('Initializing tournament...')
        // "create" was already called by factory.deploy()

        console.log('Opening registration...')
        await appClient.send.openRegistration({
            args: {},
        })
    }

    // Get info using the new methods
    const info = await appClient.send.getTournamentInfo({
        args: {},
    })

    console.log(`Tournament Info:`)
    console.log(`  App ID: ${result.appId}`)
    console.log(`  App Address: ${result.appAddress}`)
    // @ts-expect-error generated return type is broader than runtime shape
    console.log(`  Season: ${info.return?.season}`)
    // @ts-expect-error generated return type is broader than runtime shape
    console.log(`  Bracket Size: ${info.return?.bracketSize}`)
    // @ts-expect-error generated return type is broader than runtime shape
    console.log(`  Registered: ${info.return?.registeredCount}`)
    // @ts-expect-error generated return type is broader than runtime shape
    console.log(`  State: ${info.return?.state}`)
}
