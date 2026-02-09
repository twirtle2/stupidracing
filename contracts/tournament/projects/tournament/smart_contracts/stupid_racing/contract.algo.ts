import type { Account, bytes, uint64 } from '@algorandfoundation/algorand-typescript'
import {
    abimethod,
    arc4,
    assert,
    BoxMap,
    Bytes,
    clone,
    Global,
    GlobalState,
    itxn,
    op,
    Txn,
    Uint64,
} from '@algorandfoundation/algorand-typescript'

/**
 * Team registration data structure
 */
type TeamRegistration = {
    assetId0: uint64
    assetId1: uint64
    assetId2: uint64
    assetId3: uint64
    assetId4: uint64
    slotIndex: uint64
    registeredAt: uint64
}

/**
 * Match result stored on-chain
 */
type MatchResult = {
    leftWallet: Account
    rightWallet: Account
    winner: Account
    leftScore: uint64
    rightScore: uint64
    seed: bytes     // The random seed used for this match verification
}

// Tournament states
const STATE_CREATED: uint64 = Uint64(0)
const STATE_REGISTRATION_OPEN: uint64 = Uint64(1)
const STATE_LOCKED: uint64 = Uint64(2)
const STATE_RACING: uint64 = Uint64(3)
const STATE_COMPLETED: uint64 = Uint64(4)
const STATE_CANCELLED: uint64 = Uint64(5)

// Race constants
const START_POS: uint64 = Uint64(50)
const CLIFF_THRESHOLD: uint64 = Uint64(50)
const FINISH_THRESHOLD: uint64 = Uint64(71) // 50 + 21

/**
 * StupidHorse Racing Tournament Contract
 */
export class StupidRacingTournament extends arc4.Contract {
    beaconAppId = GlobalState<uint64>({ key: Bytes`beacon_app_id` })
    season = GlobalState<uint64>({ key: Bytes`season` })
    bracketSize = GlobalState<uint64>({ key: Bytes`bracket_size` })
    admin = GlobalState<Account>({ key: Bytes`admin` })
    state = GlobalState<uint64>({ key: Bytes`state` })
    registeredCount = GlobalState<uint64>({ key: Bytes`registered_count` })
    vrfCommitRound = GlobalState<uint64>({ key: Bytes`vrf_commit_round` })
    champion = GlobalState<Account>({ key: Bytes`champion` })
    teams = BoxMap<Account, TeamRegistration>({ keyPrefix: Bytes`t` })
    bracketSlots = BoxMap<uint64, Account>({ keyPrefix: Bytes`s` })
    matchResults = BoxMap<uint64, MatchResult>({ keyPrefix: Bytes`m` })

    @abimethod({ onCreate: 'require' })
    public create(
        season: uint64,
        bracketSize: uint64,
        beaconAppId: uint64
    ): void {
        assert(
            bracketSize === Uint64(8) ||
            bracketSize === Uint64(16) ||
            bracketSize === Uint64(32) ||
            bracketSize === Uint64(64),
            'Bracket size must be 8, 16, 32, or 64'
        )

        this.season.value = season
        this.bracketSize.value = bracketSize
        this.beaconAppId.value = beaconAppId
        this.admin.value = Txn.sender
        this.state.value = STATE_CREATED
        this.registeredCount.value = Uint64(0)
    }

    @abimethod()
    public openRegistration(): void {
        assert(Txn.sender === this.admin.value, 'Only admin can open registration')
        assert(this.state.value === STATE_CREATED, 'Tournament must be in created state')
        this.state.value = STATE_REGISTRATION_OPEN
    }

    @abimethod()
    public registerTeam(
        assetId0: uint64,
        assetId1: uint64,
        assetId2: uint64,
        assetId3: uint64,
        assetId4: uint64
    ): void {
        assert(this.state.value === STATE_REGISTRATION_OPEN, 'Registration is not open')
        assert(!this.teams(Txn.sender).exists, 'Team already registered')

        const currentCount: uint64 = this.registeredCount.value
        assert(currentCount < this.bracketSize.value, 'Bracket is full')

        const team: TeamRegistration = {
            assetId0: assetId0,
            assetId1: assetId1,
            assetId2: assetId2,
            assetId3: assetId3,
            assetId4: assetId4,
            slotIndex: currentCount,
            registeredAt: Global.latestTimestamp,
        }

        this.teams(Txn.sender).value = clone(team)
        this.bracketSlots(currentCount).value = Txn.sender
        this.registeredCount.value = currentCount + Uint64(1)

        if (this.registeredCount.value === this.bracketSize.value) {
            this.lockTournament()
        }
    }

    private lockTournament(): void {
        this.state.value = STATE_LOCKED
        this.vrfCommitRound.value = Global.round + Uint64(16)
    }

    @abimethod()
    public closeTournament(): void {
        assert(Txn.sender === this.admin.value, 'Only admin can close tournament')
        this.state.value = STATE_CANCELLED
    }

    @abimethod({ readonly: true })
    public getTeam(wallet: Account): TeamRegistration {
        assert(this.teams(wallet).exists, 'Team not registered')
        return clone(this.teams(wallet).value)
    }

    @abimethod({ readonly: true })
    public getSlot(slotIndex: uint64): Account {
        assert(this.bracketSlots(slotIndex).exists, 'Slot is empty')
        return this.bracketSlots(slotIndex).value
    }

    @abimethod({ readonly: true })
    public getTournamentInfo(): {
        season: uint64
        bracketSize: uint64
        registeredCount: uint64
        state: uint64
    } {
        return {
            season: this.season.value,
            bracketSize: this.bracketSize.value,
            registeredCount: this.registeredCount.value,
            state: this.state.value,
        }
    }

    @abimethod({ readonly: true })
    public getMatchResult(matchId: uint64): MatchResult {
        assert(this.matchResults(matchId).exists, 'Match result not found')
        return clone(this.matchResults(matchId).value)
    }

    @abimethod()
    public runMatch(roundIndex: uint64, matchIndex: uint64): void {
        assert(
            this.state.value === STATE_LOCKED || this.state.value === STATE_RACING,
            'Tournament not ready'
        )
        assert(Global.round >= this.vrfCommitRound.value, 'VRF round not reached')

        const matchId: uint64 = roundIndex * Uint64(100) + matchIndex
        assert(!this.matchResults(matchId).exists, 'Match already played')

        // Call Randomness Beacon using inner transaction
        const matchSalt = op.itob(matchId)
        // Encode byte array for ARC-4: [2-byte len][data]
        const saltLenBytes = op.itob(op.len(matchSalt))
        const saltLenPrefix = op.extract(saltLenBytes, Uint64(6), Uint64(2))
        const encodedSalt = op.concat(saltLenPrefix, matchSalt)

        const result = itxn.applicationCall({
            appId: this.beaconAppId.value,
            appArgs: [
                arc4.methodSelector('must_get(uint64,byte[])byte[]'),
                op.itob(this.vrfCommitRound.value), // uint64 is just 8 bytes in ARC-4
                encodedSalt
            ],
            fee: Uint64(0), // Fee pooling expected
        }).submit()

        // Parse result from last log
        const rawLog = result.lastLog
        // Offset 6 (4 prefix + 2 length) to get 32 bytes of randomness
        const vrfOutput = op.extract(rawLog, Uint64(6), Uint64(32))

        // Determine participants
        let leftWallet: Account = Global.creatorAddress
        let rightWallet: Account = Global.creatorAddress

        if (roundIndex === Uint64(0)) {
            leftWallet = this.bracketSlots(matchIndex * Uint64(2)).value
            rightWallet = this.bracketSlots(matchIndex * Uint64(2) + Uint64(1)).value
        } else {
            const prevRound: uint64 = roundIndex - Uint64(1)
            const leftPrevId: uint64 = prevRound * Uint64(100) + matchIndex * Uint64(2)
            const rightPrevId: uint64 = prevRound * Uint64(100) + matchIndex * Uint64(2) + Uint64(1)
            leftWallet = clone(this.matchResults(leftPrevId).value).winner
            rightWallet = clone(this.matchResults(rightPrevId).value).winner
        }

        // SIMULATE RACE ON-CHAIN
        const map = this.simulateRace(vrfOutput)

        const matchResult: MatchResult = {
            leftWallet: leftWallet,
            rightWallet: rightWallet,
            winner: map.winnerIsLeft ? leftWallet : rightWallet,
            leftScore: map.leftScore,
            rightScore: map.rightScore,
            seed: vrfOutput
        }

        this.matchResults(matchId).value = clone(matchResult)

        if (this.state.value === STATE_LOCKED) this.state.value = STATE_RACING

        const totalRounds: uint64 = this.calculateTotalRounds()
        if (roundIndex === totalRounds - Uint64(1)) {
            this.champion.value = matchResult.winner
            this.state.value = STATE_COMPLETED
        }
    }

    private simulateRace(seed: bytes): { winnerIsLeft: boolean, leftScore: uint64, rightScore: uint64 } {
        let leftWins: uint64 = Uint64(0)
        let rightWins: uint64 = Uint64(0)
        let currentSeed = seed

        for (let i = Uint64(0); i < Uint64(5); i = i + Uint64(1)) {
            const heatRand = op.sha256(currentSeed)
            const outcome: uint64 = this.runHeat(heatRand)
            if (outcome === Uint64(1)) leftWins = leftWins + Uint64(1)
            else if (outcome === Uint64(2)) rightWins = rightWins + Uint64(1)

            currentSeed = heatRand
        }

        let winnerIsLeft = leftWins > rightWins
        if (leftWins === rightWins) {
            const lastByte: uint64 = op.getByte(currentSeed, Uint64(0))
            winnerIsLeft = lastByte % Uint64(2) === Uint64(0)
        }

        return { winnerIsLeft, leftScore: leftWins, rightScore: rightWins }
    }

    private runHeat(randomness: bytes): uint64 { // 0=draw, 1=left, 2=right
        let leftPos = START_POS
        let rightPos = START_POS
        let status = Uint64(0) // 0=running/draw

        // Run up to 16 steps using 32 bytes of randomness (2 bytes per step)
        for (let step = Uint64(0); step < Uint64(16); step = step + Uint64(1)) {
            const leftByte: uint64 = op.getByte(randomness, step * Uint64(2))
            const rightByte: uint64 = op.getByte(randomness, step * Uint64(2) + Uint64(1))

            // Inline move logic
            const lMod: uint64 = leftByte % Uint64(5)
            if (lMod === Uint64(0)) leftPos = leftPos - Uint64(5)
            else if (lMod === Uint64(1)) leftPos = leftPos - Uint64(3)
            else if (lMod === Uint64(2)) leftPos = leftPos - Uint64(1)
            else if (lMod === Uint64(3)) leftPos = leftPos + Uint64(3)
            else if (lMod === Uint64(4)) leftPos = leftPos + Uint64(5)

            const rMod: uint64 = rightByte % Uint64(5)
            if (rMod === Uint64(0)) rightPos = rightPos - Uint64(5)
            else if (rMod === Uint64(1)) rightPos = rightPos - Uint64(3)
            else if (rMod === Uint64(2)) rightPos = rightPos - Uint64(1)
            else if (rMod === Uint64(3)) rightPos = rightPos + Uint64(3)
            else if (rMod === Uint64(4)) rightPos = rightPos + Uint64(5)

            const leftFinish = leftPos >= FINISH_THRESHOLD
            const rightFinish = rightPos >= FINISH_THRESHOLD
            const leftCliff = leftPos <= CLIFF_THRESHOLD
            const rightCliff = rightPos <= CLIFF_THRESHOLD

            if (leftFinish && rightFinish) { status = Uint64(0); break } // Draw (tie)
            if (leftCliff && rightCliff) { status = Uint64(0); break } // Draw (both dead)
            if (leftFinish || rightCliff) { status = Uint64(1); break } // Left wins
            if (rightFinish || leftCliff) { status = Uint64(2); break } // Right wins
        }
        return status
    }

    private calculateTotalRounds(): uint64 {
        const size = this.bracketSize.value
        if (size === Uint64(8)) return Uint64(3)
        if (size === Uint64(16)) return Uint64(4)
        if (size === Uint64(32)) return Uint64(5)
        if (size === Uint64(64)) return Uint64(6)
        return Uint64(3)
    }

    @abimethod({ readonly: true })
    public getChampion(): Account {
        return this.champion.value
    }
}
