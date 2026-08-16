/**
 * Default earmarked funds for a congregation that wants named money
 * before the need arrives — building, ministry, neighbor, and survival.
 */

const CHURCH_FUNDS = [
  {
    name: 'General Fund',
    description: 'Unrestricted general operating fund',
    is_restricted: false,
  },
  {
    name: 'Missions Fund',
    description: 'Designated for missionary support',
    is_restricted: true,
  },
  {
    name: 'Building Fund',
    description: 'Building repairs, improvements, and ending deferred maintenance',
    is_restricted: true,
  },
  {
    name: 'Benevolence Fund',
    description: 'Gifting to members and neighbors in need',
    is_restricted: true,
  },
  {
    name: 'Youth Fund',
    description: 'Youth ministry — camp, teaching, and events',
    is_restricted: true,
  },
  {
    name: 'Outreach Events Fund',
    description: 'Community outreach and hospitality events',
    is_restricted: true,
  },
  {
    name: 'Game Night Fund',
    description: 'Fellowship game nights and related hospitality',
    is_restricted: true,
  },
  {
    name: 'Emergency Fund',
    description: 'Operating reserve so a hard month is planned for, not guessed at',
    is_restricted: true,
  },
];

/** Givelify envelope / campaign names → fund names (lowercase keys). */
const DEFAULT_ENVELOPE_MAP = {
  'tithe': 'General Fund',
  'tithes': 'General Fund',
  'offering': 'General Fund',
  'offerings': 'General Fund',
  'general': 'General Fund',
  'general fund': 'General Fund',
  'general offering': 'General Fund',
  'tithes and offerings': 'General Fund',
  'tithes & offerings': 'General Fund',
  'missions': 'Missions Fund',
  'mission': 'Missions Fund',
  'missions fund': 'Missions Fund',
  'building': 'Building Fund',
  'building fund': 'Building Fund',
  'maintenance': 'Building Fund',
  'deferred maintenance': 'Building Fund',
  'benevolence': 'Benevolence Fund',
  'benevolence fund': 'Benevolence Fund',
  'needy': 'Benevolence Fund',
  'gifting to the needy': 'Benevolence Fund',
  'youth': 'Youth Fund',
  'youth ministry': 'Youth Fund',
  'youth fund': 'Youth Fund',
  'outreach': 'Outreach Events Fund',
  'outreach events': 'Outreach Events Fund',
  'outreach events fund': 'Outreach Events Fund',
  'game night': 'Game Night Fund',
  'game night fund': 'Game Night Fund',
  'fellowship': 'Game Night Fund',
  'emergency': 'Emergency Fund',
  'emergency fund': 'Emergency Fund',
  'reserve': 'Emergency Fund',
};

module.exports = {
  CHURCH_FUNDS,
  DEFAULT_ENVELOPE_MAP,
};
