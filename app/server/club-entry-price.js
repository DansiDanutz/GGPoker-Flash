// SPDX-License-Identifier: AGPL-3.0-only
// The 4% platform commission must be representable in whole cents.
export const validClubEntryFee = cents => Number.isSafeInteger(cents) && cents >= 0 && cents <= 100000 && cents % 25 === 0;
