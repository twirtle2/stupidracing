import { Uint64 } from '@algorandfoundation/algorand-typescript'
import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { afterEach, describe, expect, test } from 'vitest'
import { StupidRacingTournament } from './contract.algo'

function setupTournament(ctx: TestExecutionContext, beaconAppId = 777_777) {
  const contract = ctx.contract.create(StupidRacingTournament)
  contract.create(1, 2, beaconAppId)
  contract.openRegistration()
  return contract
}

function seedAssetsForSender(ctx: TestExecutionContext, assetIds: number[]) {
  const sender = ctx.defaultSender
  assetIds.forEach((assetId) => {
    ctx.any.asset({ assetId: Uint64(assetId), total: Uint64(1) })
    ctx.ledger.updateAssetHolding(sender, Uint64(assetId), Uint64(1), false)
  })
}

function registerTeam(contract: StupidRacingTournament, assetIds: number[]) {
  contract.registerTeam(
    Uint64(assetIds[0]),
    Uint64(assetIds[1]),
    Uint64(assetIds[2]),
    Uint64(assetIds[3]),
    Uint64(assetIds[4]),
  )
}

describe('StupidRacingTournament contract hardening', () => {
  const ctx = new TestExecutionContext()

  afterEach(() => {
    ctx.reset()
  })

  test('rejects duplicate team asset IDs', () => {
    const contract = setupTournament(ctx)
    seedAssetsForSender(ctx, [101, 102, 103, 104, 105])

    expect(() =>
      contract.registerTeam(Uint64(101), Uint64(101), Uint64(103), Uint64(104), Uint64(105)),
    ).toThrow(/Team assets must be unique/)
  })

  test('rejects registration when sender does not own submitted asset', () => {
    const contract = setupTournament(ctx)

    expect(() => registerTeam(contract, [201, 202, 203, 204, 205])).toThrow(
      /Sender must own each horse asset/,
    )
  })

  test('runMatch rejects unauthorized caller', () => {
    const contract = setupTournament(ctx)
    const unauthorized = ctx.any.account()

    ctx.defaultSender = unauthorized

    expect(() => contract.runMatch(Uint64(0), Uint64(0))).toThrow(/Only admin can run matches/)
  })

  test('runMatch fails when pooled fee is insufficient', () => {
    const contract = setupTournament(ctx)

    contract.state.value = Uint64(2)
    contract.vrfCommitRound.value = Uint64(0)
    ctx.ledger.patchGlobalData({ round: Uint64(1_000) })

    expect(() => contract.runMatch(Uint64(0), Uint64(0))).toThrow(/Insufficient fee pooling for beacon call/)
  })

  test('runMatch surfaces beacon failure when fee requirement is satisfied', () => {
    const contract = setupTournament(ctx)

    contract.state.value = Uint64(2)
    contract.vrfCommitRound.value = Uint64(0)
    ctx.ledger.patchGlobalData({
      round: Uint64(1_000),
      minTxnFee: Uint64(0),
    })

    expect(() => contract.runMatch(Uint64(0), Uint64(0))).toThrow()
  })
})
