import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { StupidRacingTournamentFactory } from '../artifacts/stupid_racing/StupidRacingTournamentClient'

export async function deploy() {
    console.log('=== Deploying StupidRacingTournament ===')

    const algorand = AlgorandClient.fromEnvironment()
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
                bracketSize: 8n,
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
    // @ts-ignore
    console.log(`  Season: ${info.return?.season}`)
    // @ts-ignore
    console.log(`  Bracket Size: ${info.return?.bracketSize}`)
    // @ts-ignore
    console.log(`  Registered: ${info.return?.registeredCount}`)
    // @ts-ignore
    console.log(`  State: ${info.return?.state}`)
}
