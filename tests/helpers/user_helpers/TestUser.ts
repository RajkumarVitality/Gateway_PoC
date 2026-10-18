import {
  calculateVitalityStatus,
  captureLoginEvents,
  createPartyCore,
  deleteUserInstruction,
  enrolUser,
  getUserInstruction,
  printUserDetails,
  processEvents,
  processEventToCreateReward,
  registerUser
} from '../../../src/config/API-to-Create-New-User.js';
import { requiredSetting } from '../../../src/config/mobileSessionInit.js';
import { requiredUserCreationSetting, selectedEnvironment } from '../../../src/config/userCreation.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarios } from '../../../src/config/runner.js';

let member: string | undefined;

export const testAccounts = {
  get member(): string {
    if (!member) {
      throw new Error('The member account has not been provisioned. User creation must succeed in beforeSession before accessing it.');
    }
    return member;
  }
};

export function assertTestAccountReady(): void {
  void testAccounts.member;
}

export async function initializeTestAccountsForSpecs(specs: string[]): Promise<void> {
  member = undefined;
  if (specs.length !== 1) {
    throw new Error('Member provisioning requires exactly one spec per mobile worker.');
  }
  const specPath = specs[0].startsWith('file:') ? fileURLToPath(specs[0]) : specs[0];
  const definition = Object.values(scenarios).find(value => path.basename(value.file) === path.basename(specPath));
  if (!definition) {
    throw new Error(`No provisioning policy is registered for spec "${path.basename(specPath)}".`);
  }
  if (!definition.provisionMember) return;
  console.log(`[UserProvisioning] Creating member before mobile session for ${path.basename(specPath)}.`);
  await initializeTestAccounts();
  console.log(`[UserProvisioning] Member ready for ${path.basename(specPath)}; mobile session may start.`);
}

export async function initializeTestAccounts(): Promise<void> {
  member = undefined;
  const environment = selectedEnvironment();
  const prefix = `VG_${environment.toUpperCase().replace('-', '_')}_`;
  const loginPrefix = requiredUserCreationSetting(`${prefix}LOGIN_PREFIX`);
  requiredSetting('APP_PASSWORD');
  for (const key of ['ZUUL_URL', 'TENANT_NUMBER', 'INTEGRATION_PLATFORM_BASE_URL', 'EMAIL_DOMAIN']) {
    requiredUserCreationSetting(`${prefix}${key}`);
  }
  requiredUserCreationSetting('configUserAgent');
  for (const key of ['API_BASIC_AUTH', 'API_BEARER_TOKEN']) {
    const value = requiredUserCreationSetting(`${prefix}${key}`).replace(/^(Basic|Bearer)\s+/i, '');
    if (!value || value === '******') {
      throw new Error(`Provide a valid ${prefix}${key} before provisioning the member account.`);
    }
  }
  const carrierPartyId = await createPartyCore();
  const user = await enrolUser(carrierPartyId);
  await registerUser(user);
  await calculateVitalityStatus(user.vitalityMembershipId);
  const instructions = await getUserInstruction(user.userName);
  await captureLoginEvents(user.partyId, instructions.LOGIN_T_AND_C_ID);
  await processEventToCreateReward(user.partyId);
  await processEvents(user.partyId);
  await deleteUserInstruction(user.userName, instructions);
  printUserDetails(user);
  member = `${loginPrefix}${user.userName}`;
  console.log(`Member username: ${member}`);
}