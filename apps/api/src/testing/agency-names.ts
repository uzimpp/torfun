import type { AgencyNameSource } from '../repositories/procurement.repository';

/**
 * A fixed list of agency names standing in for what Discovery has ingested.
 *
 * The real source is `distinct('dept_name')` over the procurement records, and
 * ingested data is evidence — nothing may seed it — so a test that wants to
 * see a government suggestion supplies the names here instead of writing rows
 * a run never produced.
 */
export class FixedAgencyNames implements AgencyNameSource {
  constructor(private readonly names: string[]) {}

  async agencies(): Promise<string[]> {
    return [...this.names];
  }
}
