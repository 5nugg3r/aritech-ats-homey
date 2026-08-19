'use strict';

/**
 * After an accepted arm/disarm the tile shows the requested state right away,
 * so it does not spring back during the panel's exit countdown. That means the
 * tile reflects a request rather than an observation until the panel confirms
 * it. These helpers decide what to do when confirmation never arrives.
 */

/**
 * How long to wait for the panel to confirm a requested state. Exit delays are
 * typically 30–60 s, so this leaves room without hiding a failure for long.
 */
const ARM_CONFIRM_TIMEOUT_MS = 120000;

/**
 * Decide what to do when a requested state was never confirmed by the panel.
 *
 * @param {string|null} requested - The state shown optimistically.
 * @param {string|null} lastObserved - The last state actually reported by the panel.
 * @returns {{revertTo: string|null, message: string}|null} Null when nothing is wrong.
 */
function unconfirmedArmOutcome(requested, lastObserved) {
  if (!requested) return null;
  if (lastObserved && lastObserved === requested) return null;

  if (!lastObserved) {
    return {
      revertTo: null,
      message: `The panel never confirmed "${requested}". The displayed state may not match the panel.`,
    };
  }
  return {
    revertTo: lastObserved,
    message: `The panel did not confirm "${requested}" and still reports "${lastObserved}". Check the panel.`,
  };
}

module.exports = { ARM_CONFIRM_TIMEOUT_MS, unconfirmedArmOutcome };
