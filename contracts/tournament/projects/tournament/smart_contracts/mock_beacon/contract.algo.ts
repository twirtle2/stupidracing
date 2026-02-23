import type { bytes, uint64 } from '@algorandfoundation/algorand-typescript'
import { abimethod, arc4, op } from '@algorandfoundation/algorand-typescript'

export class MockBeacon extends arc4.Contract {
  @abimethod({ name: 'must_get' })
  public mustGet(round: uint64, salt: bytes): bytes {
    return op.sha256(op.concat(op.itob(round), salt))
  }
}
