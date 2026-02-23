import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import type { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { MockBeaconFactory } from '../artifacts/mock_beacon/MockBeaconClient'
import { StupidRacingTournamentFactory } from '../artifacts/stupid_racing/StupidRacingTournamentClient'

function asAddress(value: Address) {
  const withAddr = value as Address & { addr?: string }
  return withAddr.addr ?? String(value)
}

async function createHorseSet(
  sender: Address,
  count: number,
  prefix: string,
  algorand: ReturnType<typeof algorandFixture>['context']['algorand'],
) {
  const ids: bigint[] = []

  for (let i = 0; i < count; i += 1) {
    const created = await algorand.send.assetCreate({
      sender,
      total: 1n,
      decimals: 0,
      assetName: `Horse-${prefix}-${i + 1}`,
      unitName: `H${prefix}${i + 1}`,
    })

    if (!created.assetId) {
      throw new Error('Asset creation failed')
    }
    ids.push(created.assetId)
  }

  return ids
}

async function advanceRounds(
  sender: Address,
  rounds: number,
  algorand: ReturnType<typeof algorandFixture>['context']['algorand'],
) {
  for (let i = 0; i < rounds; i += 1) {
    await algorand.send.payment({
      sender,
      receiver: sender,
      amount: AlgoAmount.MicroAlgos(0),
    })
  }
}

describe('StupidRacingTournament e2e', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({ debug: true })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  test('runs full 2-team lifecycle with auth + fee checks', async () => {
    const { algorand, testAccount, generateAccount } = localnet.context
    const entrant2 = await generateAccount({ initialFunds: (20).algo() })
    const adminAddress = asAddress(testAccount)
    const entrant2Address = asAddress(entrant2)

    const beaconFactory = algorand.client.getTypedAppFactory(MockBeaconFactory, {
      defaultSender: testAccount,
    })
    const beaconDeployment = await beaconFactory.deploy({
      onUpdate: 'append',
      onSchemaBreak: 'append',
    })

    const tournamentFactory = algorand.client.getTypedAppFactory(StupidRacingTournamentFactory, {
      defaultSender: testAccount,
    })

    const tournamentDeployment = await tournamentFactory.deploy({
      onUpdate: 'append',
      onSchemaBreak: 'append',
      createParams: {
        method: 'create',
        args: {
          season: 1n,
          bracketSize: 2n,
          beaconAppId: BigInt(beaconDeployment.appClient.appId),
        },
      },
    })

    const client = tournamentDeployment.appClient

    await algorand.send.payment({
      sender: testAccount,
      receiver: client.appAddress,
      amount: AlgoAmount.Algos(2),
    })

    await client.send.openRegistration({ args: {}, sender: testAccount })

    const team1 = await createHorseSet(testAccount, 5, 'A', algorand)
    const team2 = await createHorseSet(entrant2, 5, 'B', algorand)

    await client.send.registerTeam({
      sender: testAccount,
      args: {
        assetId0: team1[0],
        assetId1: team1[1],
        assetId2: team1[2],
        assetId3: team1[3],
        assetId4: team1[4],
      },
    })

    await client.send.registerTeam({
      sender: entrant2,
      args: {
        assetId0: team2[0],
        assetId1: team2[1],
        assetId2: team2[2],
        assetId3: team2[3],
        assetId4: team2[4],
      },
    })

    const lockedInfo = await client.send.getTournamentInfo({ args: {}, sender: testAccount })
    expect(lockedInfo.return?.state).toBe(2n)

    await advanceRounds(testAccount, 20, algorand)

    await expect(
      client.send.runMatch({
        sender: entrant2,
        args: { roundIndex: 0n, matchIndex: 0n },
        extraFee: AlgoAmount.MicroAlgos(1000),
      }),
    ).rejects.toThrow(/Only admin can run matches/)

    await expect(
      client.send.runMatch({
        sender: testAccount,
        args: { roundIndex: 0n, matchIndex: 0n },
      }),
    ).rejects.toThrow(/Insufficient fee pooling for beacon call/)

    await client.send.runMatch({
      sender: testAccount,
      args: { roundIndex: 0n, matchIndex: 0n },
      extraFee: AlgoAmount.MicroAlgos(1000),
    })

    const completedInfo = await client.send.getTournamentInfo({ args: {}, sender: testAccount })
    expect(completedInfo.return?.state).toBe(4n)

    const champion = await client.send.getChampion({ args: {}, sender: testAccount })
    expect(champion.return === adminAddress || champion.return === entrant2Address).toBe(true)
  })
})
